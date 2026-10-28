import { statfs } from 'node:fs/promises';
import {
	freemem,
	hostname,
	loadavg,
	totalmem,
} from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

import { sql } from 'drizzle-orm';

import { db } from './db/client';
import { farmQuery } from './db/stats';
import {
	apiBaseUrl,
	env,
	redisKeyPrefix,
} from './env';
import { guestCount } from './guests';
import {
	count,
	DISK_KEEP_H,
	DISK_KEY,
	gaugeMax,
	timing,
} from './metrics';
import { getPlaying } from './play';
import { clientCount } from './queue';
import { redis } from './redis';
import { presenceCount } from './ws/presence';

/**
 * Once a minute, one worker checks every service prod depends on and samples the
 * host; every worker reports its own event-loop delay. All of it lands in the
 * dashboard's metrics (metrics.ts).
 */

const EVERY_MS = 60_000;
const TIMEOUT_MS = 10_000;

type Probe = { name: string; run: () => Promise<unknown> };

const http = (url: string) => async () => {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	await res.arrayBuffer();
};

const hostOf = (url: string) => new URL(url).host;

const probes = (): Probe[] => [
	{
		name: `api ${hostOf(apiBaseUrl)}`, run: http(`${apiBaseUrl}/v1/stats/version`),
	},
	...env.API_EDGES.map(url => ({
		name: `edge ${hostOf(url)}`, run: http(`${url}/v1/stats/version`),
	})),
	{
		name: `osu! api ${hostOf(env.OSU_API_URL)}`, run: http(`${env.OSU_API_URL}/healthz`),
	},
	...[env.OSU_API_FALLBACK_URL].filter(url => url !== undefined).map(url => ({
		name: `osu! api ${hostOf(url)}`, run: http(`${url}/healthz`),
	})),
	{
		name: 'mysql', run: () => db.execute(sql`SELECT 1`),
	},
	{
		name: 'stats db', run: () => farmQuery('SELECT 1', []),
	},
	{
		name: 'redis', run: () => redis.ping(),
	},
];

const LAST_KEY = `${redisKeyPrefix}metrics:probe-last`;

const check = async ({ name, run }: Probe) => {
	const start = performance.now();
	let error: string | undefined;
	try {
		await run();
	} catch (e) {
		error = (e as Error).message.slice(0, 200);
	}
	const ms = Math.round(performance.now() - start);
	timing(`probe:${name}`, ms);
	count(`probe:${name}`, error ? 'fail' : 'ok');
	await redis.hset(LAST_KEY, name, JSON.stringify({
		ok: !error, ms, at: Date.now(), error,
	}));
};

/** A number from Redis's INFO text. */
const info = (text: string, field: string) =>
	Number(new RegExp(`^${field}:(\\S+)`, 'm').exec(text)?.[1] ?? 0);

/** The disk maps, uploads and previews land on (all under the server's working dir). */
const sampleDisk = async () => {
	const fs = await statfs('.');
	const hour = Math.floor(Date.now() / 3_600_000);
	await redis.hset(DISK_KEY, hour, `${fs.bavail * fs.bsize} ${fs.blocks * fs.bsize}`);
	const old = (await redis.hkeys(DISK_KEY)).filter(h => Number(h) <= hour - DISK_KEEP_H);
	if (old.length) await redis.hdel(DISK_KEY, ...old);
};

const sampleHost = async () => {
	const memUsed = 1 - freemem() / totalmem();
	await gaugeMax('system', 'load1', loadavg()[0]);
	await gaugeMax('system', 'mem', memUsed * 100);
	const redisInfo = await redis.info();
	await gaugeMax('system', 'redis_mb', info(redisInfo, 'used_memory') / 1048576);
	await gaugeMax('system', 'redis_ops', info(redisInfo, 'instantaneous_ops_per_sec'));
	await gaugeMax('system', 'redis_clients', info(redisInfo, 'connected_clients'));
	const [rows] = await db.execute(sql`SHOW GLOBAL STATUS
		WHERE Variable_name IN ('Threads_connected', 'Threads_running')`);
	for (const row of rows as unknown as { Variable_name: string; Value: string }[]) {
		await gaugeMax('system', `db_${row.Variable_name.toLowerCase()}`, Number(row.Value));
	}
	await gaugeMax('activity', 'online', await presenceCount());
	await gaugeMax('activity', 'clients', await clientCount());
	await gaugeMax('activity', 'playing', await getPlaying());
	await gaugeMax('activity', 'guests', await guestCount());
	await sampleDisk();
};

const tick = async () => {
	const minute = Math.floor(Date.now() / EVERY_MS);
	const won = await redis.set(`${redisKeyPrefix}metrics:tick:${minute}`, hostname(), 'EX', 120, 'NX');
	if (!won) return;
	const current = probes();
	await Promise.all(current.map(check));
	// a check no longer run (a removed service) leaves the dashboard
	const names = new Set(current.map(probe => probe.name));
	const gone = (await redis.hkeys(LAST_KEY)).filter(name => !names.has(name));
	if (gone.length) await redis.hdel(LAST_KEY, ...gone);
	await sampleHost();
};

const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();

/** Start the minute ticks (every worker; the Redis lock elects one for the checks). */
export const startMonitor = () => {
	const timer = setInterval(() => {
		void gaugeMax('system', 'lag_p99', lag.percentile(99) / 1e6);
		lag.reset();
		void tick().catch(e => console.error('[monitor]', (e as Error).message));
	}, EVERY_MS);
	timer.unref();
	return timer;
};

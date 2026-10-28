import { timingSafeEqual } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';

import type {
	SimInput,
	SimResult,
} from './rulesets/mania/4k/simState';
import {
	checksumOf,
	hasChart,
	isChecksum,
	keepChart,
} from './simCharts';

/**
 * The sim service: plays the sim API's requests (api/simulate.ts) on the host that runs
 * it, with whichever sim is installed (`SIM`, see sim.ts) and no database. A thread per
 * core; a request no thread is free for waits for the next one while fewer wait than
 * there are threads, so none idles for a round trip; past that, 429 at once. A request names
 * its chart by checksum: the service plays from its own copy (simCharts.ts) and asks for
 * the text (409) only when it has never had that version of the map. With `SIM_CACHE_URL`,
 * every play goes on to the oss!idle sim cache, once a second.
 */
const config = z.object({
	/** the bearer the API sends */
	SIM_SERVICE_SECRET: z.string().min(32),
	SIM_SERVICE_PORT: z.coerce.number().int().positive().default(3877),
	SIM_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
	SIM_THREADS: z.coerce.number().int().positive().default(availableParallelism()),
	SIM_CACHE_URL: z.url().optional(),
	SIM_CACHE_SECRET: z.string().min(32).optional(),
}).parse(process.env);

type Reply = { result: SimResult } | { error: string };
type Message = Reply | { ready: string };
type Job = { input: SimInput, resolve: (reply: Reply) => void };

const idle: Worker[] = [];
const busy = new Map<Worker, Job['resolve']>();
const waiting: Job[] = [];
let simName = '';

const run = (worker: Worker, { input, resolve }: Job) => {
	busy.set(worker, resolve);
	worker.postMessage(input);
};

const free = (worker: Worker) => {
	const job = waiting.shift();
	if (job) run(worker, job);
	else idle.push(worker);
};

const spawn = () => {
	const worker = new Worker(new URL('./simWorker.ts', import.meta.url));
	let ready = false;
	worker.on('message', (msg: Message) => {
		if ('ready' in msg) {
			ready = true;
			simName = msg.ready;
		} else {
			busy.get(worker)?.(msg);
			busy.delete(worker);
		}
		free(worker);
	});
	worker.on('error', e => console.error('[sim] thread failed:', e));
	worker.on('exit', () => {
		// one that never started won't start again (no sim to load): let the unit restart us
		if (!ready) process.exit(1);
		busy.get(worker)?.({ error: 'the simulation thread stopped' });
		busy.delete(worker);
		const at = idle.indexOf(worker);
		if (at >= 0) idle.splice(at, 1);
		spawn();
	});
};
for (let i = 0; i < config.SIM_THREADS; i++) spawn();

type Played = { input: SimInput, result: SimResult };
const toCache: Played[] = [];
let cacheDown = false;

/** Lost when the cache is down: it only approximates. */
const sendToCache = async () => {
	const plays = toCache.splice(0);
	if (!plays.length) return;
	const res = await fetch(`${config.SIM_CACHE_URL}/contribute`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.SIM_CACHE_SECRET}`, 'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			sim: simName, plays,
		}),
		signal: AbortSignal.timeout(10_000),
	}).catch((e: unknown) => e as Error);
	const failed = res instanceof Error ? res.message : !res.ok && `HTTP ${res.status}`;
	if (failed && !cacheDown) console.error('[sim] the sim cache took no plays:', failed);
	cacheDown = Boolean(failed);
};
if (config.SIM_CACHE_URL) setInterval(() => void sendToCache(), 1000);

const secret = Buffer.from(`Bearer ${config.SIM_SERVICE_SECRET}`);
const authorized = (header = '') => {
	const given = Buffer.from(header);
	return given.length === secret.length && timingSafeEqual(given, secret);
};

const app = new Hono()
	.get('/healthz', c => c.json({
		sim: simName, threads: config.SIM_THREADS, idle: idle.length, waiting: waiting.length,
	}))
	.post('/simulate', async c => {
		if (!authorized(c.req.header('Authorization'))) return c.json({ error: 'Unauthorized' }, 401);
		const { chart, ...input } = await c.req.json<SimInput & { chart?: string }>();
		if (!isChecksum(input.checksum)) return c.json({ error: 'No chart checksum' }, 400);
		if (chart !== undefined) {
			if (checksumOf(chart) !== input.checksum) {
				return c.json({ error: 'The chart does not match its checksum' }, 422);
			}
			if (!hasChart(input.checksum)) keepChart(input.checksum, chart);
		} else if (!hasChart(input.checksum)) {
			// never sent this version of the map: the API sends it with the request again
			return c.json({ error: 'Chart needed' }, 409);
		}
		if (!idle.length && waiting.length >= config.SIM_THREADS) {
			return c.json({ error: 'Every simulation thread is busy' }, 429);
		}
		const reply = await new Promise<Reply>(resolve => {
			const worker = idle.pop();
			if (worker) run(worker, {
				input, resolve,
			});
			else waiting.push({
				input, resolve,
			});
		});
		if ('error' in reply) return c.json(reply, 500);
		if (config.SIM_CACHE_URL && input.beatmapId && toCache.length < 10_000) {
			toCache.push({
				input, result: reply.result,
			});
		}
		return c.json(reply.result);
	});

serve({
	fetch: app.fetch, port: config.SIM_SERVICE_PORT, hostname: config.SIM_SERVICE_HOST,
});
const { SIM_SERVICE_HOST: host, SIM_SERVICE_PORT: port, SIM_THREADS: threads } = config;
console.log(`Sim service on ${host}:${port}, ${threads} threads`);

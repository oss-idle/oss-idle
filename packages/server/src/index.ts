import { appendFile } from 'node:fs/promises';
import type { Server } from 'node:http';

import { serve } from '@hono/node-server';

import Logfile from '@oss-idle/shared/helpers/logfile';

import { sweepAbby } from './abby';
import { app } from './app';
import { backfillRateStars } from './beatmaps/rateStars';
import { separateStagingMapIds } from './beatmaps/storage';
import { sweepRankedMaps } from './beatmaps/sweep';
import { closeOnDrain } from './drain';
import {
	env,
	isProd,
	port,
} from './env';
import { activateServerI18n } from './i18n';
import { checkMedalRules } from './medals';
import { countLoggedErrors } from './metrics';
import { startMonitor } from './monitor';
import { sweepDuePlays } from './play';
import {
	leaveOrPlayOn,
	sweepAway,
	sweepQueues,
} from './queue';
import {
	ensureRankings,
	sweepRankHistory,
} from './rankings';
import {
	redis,
	versionKey,
} from './redis';
import { loadRulesets } from './rulesets/registry';
import {
	loadSim,
	SCORE_VERSION,
} from './sim';
import { sweepThanks } from './supporter';
import { hub } from './ws/hub';
import {
	roundsStarted,
	sweepMatches,
} from './ws/multiplayer';
import {
	sweepAdoption,
	sweepPresence,
} from './ws/presence';
import { registerWs } from './ws/routes';

activateServerI18n();
await loadRulesets();
await loadSim();
await redis.set(versionKey, SCORE_VERSION);

// the sweeps and socket heartbeats are fire-and-forget: a database or Redis blip in
// one must not end the worker, and every socket it holds with it
process.on('unhandledRejection', e => console.error('[unhandled]', e));

Logfile.setWriter(lines => appendFile('runtime.log', lines.join('\n') + '\n'));

// Community WebSocket: mount the route on the app and start the pub/sub fan-out.
const { injectWebSocket } = registerWs(app);
countLoggedErrors();
hub.init();

const server = serve({
	fetch: app.fetch, port, hostname: env.LISTEN_HOST,
}, info => {
	console.log(`🎵 oss!idle API listening on http://localhost:${info.port}`);
});

// outlives Apache's pooled backend connections (ProxyPass ttl=60): otherwise Node closes an
// idle one just as Apache reuses it, and that request is a 502
(server as Server).keepAliveTimeout = 65_000;
const drain = closeOnDrain(server as Server);
injectWebSocket(server);

// Staging shares prod's beatmap files: its new maps count from 2e9, prod's from 1e9.
if (!isProd) void separateStagingMapIds();


checkMedalRules();

// Build the Redis ranking index from MySQL when it is missing or no longer
// matches it (one cluster worker wins the lock; the rest return immediately).
void ensureRankings();

// Stars at every rate and timing counts for the difficulties ingested before them.
void backfillRateStars();

// Finalise plays whose end time has passed even if no client ever returns to
// finish them - the server is authoritative. Safe on every worker: the atomic
// claim in finalizePlay guarantees a single submit.
const sweep = setInterval(() => void sweepDuePlays(), 3_000);
sweep.unref();

// Start the next map of every queue whose countdown is up, game open or not.
const queueSweep = setInterval(() => void sweepQueues(), 1_000);
queueSweep.unref();

// End finished match rounds and free the seats of players who went offline.
const matchSweep = setInterval(() => void sweepMatches(), 3_000);
matchSweep.unref();

// Announce scheduled maps whose rank time has passed (no redeploy needed).
const rankSweep = setInterval(() => void sweepRankedMaps(), 30_000);
rankSweep.unref();

// Record every character's daily global rank sample (one worker wins the
// per-day lock; later ticks return immediately).
void sweepRankHistory();
const rankHistorySweep = setInterval(() => void sweepRankHistory(), 15 * 60_000);
rankHistorySweep.unref();

// Prune presence entries left behind by a crashed worker / unclean disconnect.
// Characters playing with their game closed stay on it until their window ends.
// A client that vanished without its socket closing (a killed worker) is gone
// all the same: its character plays on or logs off like any other.
const presenceSweep = setInterval(
	() => void sweepAway()
		.catch(e => console.error('[queue] away sweep failed', e))
		.then(() => sweepPresence(leaveOrPlayOn)),
	30_000,
);
presenceSweep.unref();

// Drop version reports from players who haven't reconnected within the adoption
// window, so builds they've churned off stop being counted.
const adoptionSweep = setInterval(() => void sweepAdoption(), 10 * 60_000);
adoptionSweep.unref();

// Book the supporter orders past their refund window in Abby.
const abbySweep = setInterval(() => void sweepAbby(), 60 * 60_000);
abbySweep.unref();

// Send the supporter thank-yous once Stripe has each payment's net amount.
const thanksSweep = setInterval(() => void sweepThanks(), 10_000);
thanksSweep.unref();

// The dashboard's minute checks of every service prod depends on.
const monitor = startMonitor();

/**
 * Drain on a clean shutdown (systemd stop / restart, Ctrl-C, tsx-watch reload,
 * pm2 reload): stop taking requests, send the sockets to another worker, and close
 * Redis only once the requests in flight and the sockets' goodbyes are done.
 */
const shutdown = (signal: string): void => {
	console.log(`\n${signal} received - shutting down.`);
	[sweep, queueSweep, matchSweep, rankSweep, rankHistorySweep, presenceSweep, adoptionSweep, abbySweep, thanksSweep, monitor]
		.forEach(clearInterval);
	hub.closeAll();
	drain();
	server.close(() => void roundsStarted().then(() => {
		setTimeout(() => void redis.quit().finally(() => process.exit(0)), 1000);
	}));
	if ('closeIdleConnections' in server) server.closeIdleConnections();
	// Don't hang forever if a connection refuses to drain.
	setTimeout(() => process.exit(0), 6000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

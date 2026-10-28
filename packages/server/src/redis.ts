import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import {
	env,
	redisDb,
	redisKeyPrefix,
} from './env';

/**
 * Shared Redis connection. It holds the play state that used to live in
 * process memory (pending plays, online/playing presence, per-character session
 * strain), so every worker in a pm2 cluster sees the same state and a play that
 * starts on one worker can be completed on another.
 *
 * One connection per worker process; ioredis multiplexes all commands over it
 * and reconnects on its own. Persistence (surviving reboots) is Redis's job -
 * enable AOF (`appendonly yes`, `appendfsync everysec`) on the server.
 */
export const redis = new Redis({
	host: env.REDIS_HOST,
	port: env.REDIS_PORT,
	password: env.REDIS_PASSWORD,
	db: redisDb,
	// Don't let a momentary Redis outage turn into unbounded command queues.
	maxRetriesPerRequest: 3,
});

// Log connection errors instead of crashing the worker - a request that needs
// Redis while it's down will reject and surface as a 500, same as the DB.
redis.on('error', err => console.error('Redis error:', err.message));

/** Where a booted server says which score version it simulates on (sim.ts SCORE_VERSION),
 *  for the score reprocessor. */
export const versionKey = `${redisKeyPrefix}score-version`;

const LOCK_MS = 5000;
const UNLOCK = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0
`;

/** Run `fn` holding a cluster-wide lock on `key`. */
export const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
	const token = randomUUID();
	// long enough to outlast a dead worker's lock
	for (let tries = 0; await redis.set(key, token, 'PX', LOCK_MS, 'NX') !== 'OK'; tries++) {
		if (tries > LOCK_MS / 20) throw new Error(`${key} stayed locked`);
		await new Promise(r => setTimeout(r, 20));
	}
	try {
		return await fn();
	} finally {
		await redis.eval(UNLOCK, 1, key, token);
	}
};

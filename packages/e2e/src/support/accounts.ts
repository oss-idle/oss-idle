import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
	type BrowserContext,
	test,
} from '@playwright/test';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';

/**
 * Signed-in players without osu! OAuth: test accounts written straight into the
 * dev database, and a session cookie signed with the dev server's own secret.
 * Their ids sit at the top of the int range, far past any osu! user id.
 */

export type Account = { id: number; name: string; characterId: number };

const ENV_FILE = new URL('../../../server/.env', import.meta.url);

const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8')
	.split('\n')
	.map(line => /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line))
	.filter(m => m !== null)
	.map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]));

// a worktree's own stack (DEV_API_PORT) runs on a database and Redis db of its own
if (process.env.E2E_DB_NAME) env.DB_NAME_DEV = process.env.E2E_DB_NAME;
if (process.env.E2E_REDIS_DB) env.REDIS_DB = process.env.E2E_REDIS_DB;

const connect = () => mysql.createConnection({
	host: env.DB_HOST,
	port: Number(env.DB_PORT ?? 3306),
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.DB_NAME_DEV,
});

const user = (id: number, name: string) => ({
	id, name,
});

// a pair per spec file and per worker, so two tests running at once never share
// an account. Worker n > 0 moves them to 2_147_470_000 + n * 100 and names them `e2e<n> ...`.
const TEST_USERS = {
	social: [user(2_147_480_001, 'e2e Alice'), user(2_147_480_002, 'e2e Bob')],
	multiplayer: [user(2_147_480_003, 'e2e Carol'), user(2_147_480_004, 'e2e Dave')],
	rates: [user(2_147_480_005, 'e2e Erin'), user(2_147_480_006, 'e2e Frank')],
	mods: [user(2_147_480_011, 'e2e Kim'), user(2_147_480_012, 'e2e Leo')],
	queue: [user(2_147_480_007, 'e2e Grace'), user(2_147_480_008, 'e2e Heidi')],
	editor: [user(2_147_480_013, 'e2e Mia'), user(2_147_480_014, 'e2e Noah')],
	leaderboard: [user(2_147_480_009, 'e2e Ivan'), user(2_147_480_010, 'e2e Judy')],
	skins: [user(2_147_480_015, 'e2e Olga'), user(2_147_480_016, 'e2e Paul')],
	carousel: [user(2_147_480_017, 'e2e Quinn')],
	bugs: [user(2_147_480_018, 'e2e Rita')],
	downloads: [user(2_147_480_019, 'e2e Sam')],
	library: [user(2_147_480_020, 'e2e Tara')],
	genetics: [user(2_147_480_021, 'e2e Uma')],
};

// the dev server's Redis keys (redisKeyPrefix in packages/server/src/env.ts)
export const REDIS_PREFIX = 'oss-idle:dev:';

export const redisClient = () => new Redis({
	host: env.REDIS_HOST ?? '127.0.0.1',
	port: Number(env.REDIS_PORT ?? 6379),
	password: env.REDIS_PASSWORD || undefined,
	db: Number(env.REDIS_DB ?? 0),
});

/** Drop the plays and match seats an earlier test left behind: a client would
 *  load straight into spectating the play, or back into the match. */
const clearPlays = async (characterIds: number[]) => {
	const redis = redisClient();
	try {
		for (const id of characterIds) {
			await redis.del(
				`${REDIS_PREFIX}play:${id}`, `${REDIS_PREFIX}result:${id}`, `${REDIS_PREFIX}queue:${id}`,
			);
			await redis.zrem(`${REDIS_PREFIX}playing`, String(id));
			// and the server's queue, and a character still playing with its game closed
			await redis.zrem(`${REDIS_PREFIX}queue:due`, String(id));
			await redis.zrem(`${REDIS_PREFIX}away`, String(id));
			// and the match seat: rejoining an old match brings its map along
			await redis.hdel(`${REDIS_PREFIX}mp:members`, String(id));
			await redis.hdel(`${REDIS_PREFIX}mp:away`, String(id));
		}
	} finally {
		redis.disconnect();
	}
};

/** Forget the maps the accounts uploaded, so a month of runs never fills their quota. */
const dropUploads = async (db: mysql.Connection, ids: number[]) => {
	try {
		await db.query(
			'DELETE b FROM beatmap b JOIN beatmapset s ON s.id = b.set_id WHERE s.owner_user_id IN (?)', [ids],
		);
		await db.query('DELETE FROM beatmapset WHERE owner_user_id IN (?)', [ids]);
	} catch (e) {
		// a database without player uploads yet
		if ((e as { code?: string }).code !== 'ER_BAD_FIELD_ERROR') throw e;
	}
};

/** The test accounts, each with a character, cleared of whatever an earlier run
 *  left between them (friendships, blocks, reports, a restriction, Speed upgrades, a play still running). */
export const testAccounts = async (spec: keyof typeof TEST_USERS): Promise<Account[]> => {
	const slot = test.info().parallelIndex;
	const users = TEST_USERS[spec].map(u => slot ? user(
		u.id - 10_000 + slot * 100, u.name.replace('e2e', `e2e${slot}`),
	) : u);
	const ids = users.map(u => u.id);
	const db = await connect();
	try {
		const accounts: Account[] = [];
		for (const { id, name } of users) {
			await db.query(
				`INSERT INTO user (id, username, country) VALUES (?, ?, 'FR')
				ON DUPLICATE KEY UPDATE username = VALUES(username), restricted_at = NULL,
				restricted_reason = NULL, pm_from_anyone = 1`,
				[id, name],
			);
			await db.query('INSERT IGNORE INTO `character` (user_id, name) VALUES (?, ?)', [id, name]);
			const [[row]] = await db.query<mysql.RowDataPacket[]>(
				'SELECT id FROM `character` WHERE user_id = ? ORDER BY id LIMIT 1', [id],
			);
			await db.query('UPDATE user SET current_character = ? WHERE id = ?', [row.id, id]);
			await db.query(
				`UPDATE \`character\`
				SET autopilot_mode = 'PLAYLIST', autopilot_delay = 3,
					ruleset = 'mania4k', ruleset_lock = NULL
				WHERE id = ?`,
				[row.id],
			);
			// its 4K profile: skills, fatigue, rate and mods are a ruleset's
			await db.query(
				`INSERT INTO mania4k_character (id) VALUES (?)
				ON DUPLICATE KEY UPDATE speed_upgrades = 0, fatigue = NULL, play_rate = 1, play_mods = NULL`,
				[row.id],
			);
			accounts.push({
				id, name, characterId: row.id, 
			});
		}
		await db.query('DELETE FROM user_follow WHERE user_id IN (?) OR target_id IN (?)', [ids, ids]);
		await db.query('DELETE FROM user_block WHERE user_id IN (?) OR target_id IN (?)', [ids, ids]);
		await db.query('DELETE FROM user_report WHERE user_id IN (?) OR target_id IN (?)', [ids, ids]);
		await dropUploads(db, ids);
		await clearPlays(accounts.map(a => a.characterId));
		return accounts;
	} finally {
		await db.end();
	}
};

/** Rows of the dev database, for what no screen shows (a report landing). */
export const query = async <T>(sql: string, values: unknown[]): Promise<T[]> => {
	const db = await connect();
	try {
		const [rows] = await db.query(sql, values);
		return rows as T[];
	} finally {
		await db.end();
	}
};

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** The session JWT the server would have set after an osu! sign-in. */
const sessionToken = (account: Account): string => {
	const now = Math.floor(Date.now() / 1000);
	const head = `${base64url(JSON.stringify({
		alg: 'HS256', typ: 'JWT', 
	}))}.${base64url(JSON.stringify({
		uid: account.id, username: account.name, iat: now, exp: now + 3600,
	}))}`;
	return `${head}.${createHmac('sha256', env.JWT_SECRET).update(head).digest('base64url')}`;
};

export const signIn = async (context: BrowserContext, account: Account, baseURL: string) => {
	await context.addCookies([{
		name: 'session', value: sessionToken(account), url: baseURL,
	}]);
};

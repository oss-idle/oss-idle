import {
	and,
	asc,
	count,
	eq,
	inArray,
	lt,
} from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import {
	type BotMatchLive,
	type BotMatchRanks,
	type BotMatchResult,
	botOverallXp,
} from '@oss-idle/shared/botMatch';

import {
	BotMatchRefused,
	refineBotMatch,
	runBotMatch,
} from './botMatchRun';
import { db } from './db/client';
import { botMatches } from './db/schema/bot_match';
import {
	getUserById,
	users,
} from './db/schema/user';
import { redisKeyPrefix } from './env';
import { wouldBeRank } from './rankings';
import { redis } from './redis';
import { rulesetFor } from './rulesets/registry';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WAITING = ['queued', 'running'] as const;
/** First results take the sims and few requests: many fit at once. */
const FIRST_AT_ONCE = 10;
/** The rest of a player's scores cost the same osu! budget however many read at once, so each
 *  waits its turn: one after another, every one is done sooner on average. */
const REFINE_AT_ONCE = 1;
const LOCK_SECONDS = 20;
const LIVE_SECONDS = 60 * 60;
const TYPICAL = `${redisKeyPrefix}bot-match:typical-seconds`;
const TYPICAL_SECONDS = 5 * 60;

const liveKey = (userId: number) => `${redisKeyPrefix}bot-match:live:${userId}`;

const liveOf = async (userId: number) => {
	const raw = await redis.get(liveKey(userId));
	return raw ? JSON.parse(raw) as BotMatchLive : undefined;
};

/** How long until a place opens, with `ahead` others queued in front. */
const waitOf = async (ahead: number) => {
	const typical = Number(await redis.get(TYPICAL) ?? TYPICAL_SECONDS);
	return Math.ceil((ahead + 1) / FIRST_AT_ONCE) * typical;
};

/** The result as stored: the driver hands MariaDB's JSON back as text. */
const parsed = (raw: BotMatchResult | string) =>
	(typeof raw === 'string' ? JSON.parse(raw) : raw) as BotMatchResult;

const rowOf = async (userId: number) => {
	const [row] = await db.select().from(botMatches).where(eq(botMatches.userId, userId)).limit(1);
	return row && {
		...row, result: row.result ? parsed(row.result) : undefined,
	};
};

/** Where the bot would stand on the boards as they are now. */
const ranksOf = async ({ levels, performance }: BotMatchResult): Promise<BotMatchRanks> => {
	const ruleset = rulesetFor('mania4k');
	const skills = Object.entries(levels);
	const [ownPerformance, overall, ...ranks] = await Promise.all([
		wouldBeRank(ruleset, 'pp', performance),
		wouldBeRank(ruleset, 'overall', botOverallXp(levels)),
		...skills.map(([skill, level]) => wouldBeRank(ruleset, skill, level)),
	]);
	return {
		performance: ownPerformance,
		overall,
		skills: Object.fromEntries(skills.map(([skill], i) => [skill, ranks[i]!])),
	};
};

type Row = NonNullable<Awaited<ReturnType<typeof rowOf>>>;

/** Where a waiting match stands. */
const waitingOf = async (row: Row) => {
	const [ahead] = await db.select({ n: count() }).from(botMatches).where(and(
		eq(botMatches.status, 'queued'), lt(botMatches.requestedAt, row.requestedAt),
	));
	const before = ahead?.n ?? 0;
	return {
		position: before + 1,
		waitSeconds: row.status === 'queued' ? await waitOf(before) : undefined,
	};
};

/** When a finished match can run again, while it can't yet. */
const againOf = (row: Row) => {
	const again = row.status === 'done' && row.finishedAt
		? row.finishedAt.getTime() + COOLDOWN_MS
		: undefined;
	return again && again > Date.now() ? new Date(again).toISOString() : undefined;
};

/** The signed-in player's match, as their page shows it. */
export const ownBotMatch = async (userId: number) => {
	const row = await rowOf(userId);
	if (!row) return { status: 'none' as const };
	return {
		status: row.status,
		failure: row.status === 'failed' ? row.failure ?? undefined : undefined,
		...row.status === 'queued' || row.status === 'running' ? await waitingOf(row) : {},
		live: row.status === 'running' || row.status === 'refining'
			? await liveOf(row.userId)
			: undefined,
		runAgainAt: againOf(row),
		result: row.result,
		ranks: row.result ? await ranksOf(row.result) : undefined,
	};
};

/** Put the player in the queue: once a day, unless the last try failed. */
export const requestBotMatch = async (userId: number) => {
	const row = await rowOf(userId);
	if (row?.status === 'queued' || row?.status === 'running' || row?.status === 'refining') return;
	if (row?.status === 'done' && row.finishedAt
		&& row.finishedAt.getTime() + COOLDOWN_MS > Date.now()) {
		throw new HTTPException(429, { message: 'A match runs once a day' });
	}
	const queued = {
		status: 'queued', requestedAt: new Date(),
	} as const;
	await db.insert(botMatches).values({
		userId, ...queued,
	}).onDuplicateKeyUpdate({ set: queued });
};

/** A finished match, for anyone. */
export const publicBotMatch = async (userId: number) => {
	const row = await rowOf(userId);
	if (!row?.result) return undefined;
	const user = await getUserById(userId);
	if (!user || user.restrictedAt) return undefined;
	return {
		result: row.result, ranks: await ranksOf(row.result),
	};
};

type Next = { userId: number, username: string, avatarUrl: string | null };

const telling = (userId: number) => (live: BotMatchLive) =>
	void redis.set(liveKey(userId), JSON.stringify(live), 'EX', LIVE_SECONDS);

const runFirst = async (next: Next) => {
	const where = eq(botMatches.userId, next.userId);
	await db.update(botMatches).set({ status: 'running' }).where(where);
	const started = Date.now();
	try {
		const result = await runBotMatch({
			id: next.userId, username: next.username, avatarUrl: next.avatarUrl,
		}, telling(next.userId));
		await db.update(botMatches).set({
			status: 'refining', result,
		}).where(where);
		await redis.del(liveKey(next.userId));
		await redis.set(TYPICAL, Math.round((Date.now() - started) / 1000));
	} catch (e) {
		if (!(e instanceof BotMatchRefused)) console.error('[bot match] failed', next.userId, e);
		await db.update(botMatches).set({
			status: 'failed',
			failure: e instanceof BotMatchRefused ? e.failure : 'unavailable',
			finishedAt: new Date(),
		}).where(where);
	}
};

/** Whatever goes wrong, the first result stands. */
const runRefine = async (next: Next) => {
	const row = await rowOf(next.userId);
	if (!row?.result) return;
	const where = eq(botMatches.userId, next.userId);
	const result = await refineBotMatch({
		id: next.userId, username: next.username, avatarUrl: next.avatarUrl,
	}, row.result, telling(next.userId)).catch((e: unknown) => {
		console.error('[bot match] refining failed', next.userId, e);
		return row.result!;
	});
	await db.update(botMatches).set({
		status: 'done', result, finishedAt: new Date(),
	}).where(where);
	await redis.del(liveKey(next.userId));
};

const POOLS = [
	{
		name: 'first', size: FIRST_AT_ONCE, statuses: [...WAITING], run: runFirst,
	},
	{
		name: 'refine', size: REFINE_AT_ONCE, statuses: ['refining' as const], run: runRefine,
	},
];
type Pool = (typeof POOLS)[number];

const claim = async (key: string) =>
	await redis.set(key, '1', 'EX', LOCK_SECONDS, 'NX') === 'OK';

/** The oldest match nobody holds, a run a restart cut short included: it holds its place. */
const claimNext = async (pool: Pool) => {
	const rows = await db
		.select({
			userId: botMatches.userId,
			username: users.username,
			avatarUrl: users.avatarUrl,
		})
		.from(botMatches)
		.innerJoin(users, eq(users.id, botMatches.userId))
		.where(inArray(botMatches.status, pool.statuses))
		.orderBy(asc(botMatches.requestedAt))
		.limit(pool.size + 1);
	for (const row of rows) {
		const key = `${redisKeyPrefix}bot-match:claim:${row.userId}`;
		if (await claim(key)) return {
			row, key,
		};
	}
	return undefined;
};

/** Holds the keys for as long as the work takes, and a restart lets them go. */
const holding = async (keys: string[], work: () => Promise<void>) => {
	const keep = setInterval(
		() => keys.forEach(key => void redis.expire(key, LOCK_SECONDS)),
		LOCK_SECONDS * 250,
	);
	try {
		await work();
	} finally {
		clearInterval(keep);
		await redis.del(...keys);
	}
};

const fillPool = async (pool: Pool) => {
	for (let slot = 0; slot < pool.size; slot++) {
		const slotKey = `${redisKeyPrefix}bot-match:${pool.name}:${slot}`;
		if (!await claim(slotKey)) continue;
		const next = await claimNext(pool);
		if (!next) {
			await redis.del(slotKey);
			return;
		}
		void holding([slotKey, next.key], () => pool.run(next.row)).catch((e: unknown) => {
			console.error('[bot match] sweep failed', next.row.userId, e);
		});
	}
};

/** Starts what fits, across every worker: each match holds a place until it's done. */
export const sweepBotMatches = async () => {
	try {
		for (const pool of POOLS) await fillPool(pool);
	} catch (e) {
		console.error('[bot match] sweep failed', e);
	}
};

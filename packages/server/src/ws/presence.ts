import {
	type PresenceEntry,
	STATUS,
	type Status,
} from '@oss-idle/shared/community/presence';
import {
	MAKISEBOT_ID,
	MAKISEBOT_USER_ID,
} from '@oss-idle/shared/groups';
import compareVersions from '@oss-idle/shared/helpers/compareVersions';
import { xpGivesLevel } from '@oss-idle/shared/xp';

import {
	type CharacterRow,
	getCharacterById,
	profileOf,
	resolveAvatarUrl,
} from '../db/schema/character';
import { getCharacterTotals } from '../db/schema/character_totals';
import {
	getUserById,
	type UserRow,
} from '../db/schema/user';
import { redisKeyPrefix } from '../env';
import type { GeoResult } from '../geo';
import {
	globalRank,
	ppTopPercent,
} from '../rankings';
import { redis } from '../redis';
import { selectedRuleset } from '../rulesets/registry';
import { hub } from './hub';

/**
 * The live roster behind the community overlay. Each open WebSocket adds one
 * entry; the entry carries everything a player card / world-map dot needs. Stored
 * in Redis (shared across the cluster) as a hash keyed by character, with a
 * companion sorted set of last-seen times so a worker crash can't leak a ghost -
 * the sweep prunes anyone who stopped refreshing.
 */

const PRESENCE_KEY = `${redisKeyPrefix}presence`;
const SEEN_KEY = `${redisKeyPrefix}presence:seen`;
/** Character -> last reported client build, with a companion last-seen ZSET.
 *  A rolling window: refreshed every time the player connects and reports a
 *  version, and swept once they haven't reported for ADOPTION_TTL - so it's the
 *  version distribution across recently-active players, not just those online
 *  now. A player who never reconnects on an old build stops being counted. */
const ADOPTION_KEY = `${redisKeyPrefix}adoption`;
const ADOPTION_SEEN_KEY = `${redisKeyPrefix}adoption:seen`;

/** Drop a character's reported version once they've gone this long without
 *  reconnecting (they've effectively churned off that build). */
const ADOPTION_TTL = 7 * 24 * 60 * 60 * 1000;

/** A presence entry whose last-seen wasn't refreshed within this window is swept. */
const PRESENCE_TTL = 90 * 1000;

const buildEntry = async (params: {
	character: CharacterRow;
	user: UserRow;
	geo: GeoResult;
	status: Status;
}): Promise<PresenceEntry> => {
	const { character, user, geo, status } = params;
	// the card shows the ruleset the player picked
	const r = selectedRuleset(character);
	const [totals, profile] = await Promise.all([
		getCharacterTotals(r, character.id), profileOf(r, character.id),
	]);
	const topPercent = Number(profile.pp) > 0 ? await ppTopPercent(r, character.id) : undefined;
	return {
		characterId: character.id,
		userId: user.id,
		name: character.name,
		avatarUrl: resolveAvatarUrl(character.avatarUrl, user.avatarUrl),
		country: user.country,
		rank: await globalRank(r, 'pp', character.id),
		rankPercent: topPercent === undefined ? undefined : topPercent / 100,
		pp: Number(profile.pp),
		accuracy: r.def.accuracyOf(totals as unknown as Record<string, number>),
		playCount: totals.playCount,
		level: xpGivesLevel(profile.overallLifetimeXp).level,
		status,
		loc: geo.loc,
		tz: geo.tz,
	};
};

/** The card of a player who isn't online: what their presence entry would say, without where they are. */
export const offlineEntry = (character: CharacterRow, user: UserRow): Promise<PresenceEntry> =>
	buildEntry({
		character, user, geo: {}, status: STATUS.idle,
	});

/** MakiseBot's card, always online though no socket holds it: kept out of the
 *  hash, so the sweep never drops it and the online count stays players. Built
 *  once per worker; a failed read is tried again next time. */
let makiseBot: Promise<PresenceEntry | undefined> | undefined;
const makiseBotEntry = (): Promise<PresenceEntry | undefined> => makiseBot ??= (async () => {
	const [character, user] = await Promise.all([
		getCharacterById(MAKISEBOT_ID), getUserById(MAKISEBOT_USER_ID),
	]);
	return character && user && buildEntry({
		character, user, geo: {}, status: STATUS.idle,
	});
})().catch((e: unknown) => {
	console.error('[presence] MakiseBot card failed', e);
	makiseBot = undefined;
	return undefined;
});

const store = (entry: PresenceEntry): Promise<unknown> =>
	redis.multi()
		.hset(PRESENCE_KEY, String(entry.characterId), JSON.stringify(entry))
		.zadd(SEEN_KEY, Date.now(), String(entry.characterId))
		.exec();

const readEntry = async (characterId: number): Promise<PresenceEntry | undefined> => {
	const v = await redis.hget(PRESENCE_KEY, String(characterId));
	return v ? JSON.parse(v) as PresenceEntry : undefined;
};

/** The timezone of a connected player's location, if known. */
export const presenceTimezone = async (characterId: number): Promise<string | undefined> =>
	(await readEntry(characterId))?.tz;

/** Which of these characters are connected, in order. */
export const areOnline = async (characterIds: number[]): Promise<boolean[]> => {
	if (!characterIds.length) return [];
	const found = await redis.hmget(PRESENCE_KEY, ...characterIds.map(String));
	return found.map((v, i) => v !== null || characterIds[i] === MAKISEBOT_ID);
};

/** Live count of connected players. */
export const presenceCount = (): Promise<number> => redis.hlen(PRESENCE_KEY);

/** Every connected player and MakiseBot (the snapshot a freshly connected client receives). */
export const presenceSnapshot = async (): Promise<PresenceEntry[]> => {
	const [all, bot] = await Promise.all([redis.hvals(PRESENCE_KEY), makiseBotEntry()]);
	const entries = all.map(v => JSON.parse(v) as PresenceEntry);
	return bot ? [...entries, bot] : entries;
};

const broadcastOnline = async (): Promise<void> =>
	hub.broadcast({
		type: 'online', count: await presenceCount(),
	});

/** Register a newly connected player and announce them. */
export const join = async (params: {
	character: CharacterRow;
	user: UserRow;
	geo: GeoResult;
}): Promise<PresenceEntry> => {
	const entry = await buildEntry({
		...params, status: STATUS.idle,
	});
	// a restricted account never shows as online
	if (params.user.restrictedAt) return entry;
	await store(entry);
	hub.broadcast({
		type: 'presence:add', entry,
	});
	await broadcastOnline();
	return entry;
};

/**
 * Move a connected player's roster entry onto the character a rebirth just
 * created. The entry is keyed by character, so without this the old id stops
 * being touched and is swept, while the new one has nothing to update - the
 * player disappears from the overlay until they reconnect.
 *
 * The card is rebuilt rather than relabelled: it is a different character, with
 * its own name, level and rank. Where it is and what it is doing carry over.
 */
export const rekey = async (params: {
	fromId: number;
	character: CharacterRow;
	user: UserRow;
}): Promise<void> => {
	const previous = await readEntry(params.fromId);
	if (!previous || params.user.restrictedAt) return;

	await redis.multi()
		.hdel(PRESENCE_KEY, String(params.fromId))
		.zrem(SEEN_KEY, String(params.fromId))
		.exec();

	const entry = await buildEntry({
		character: params.character,
		user: params.user,
		geo: {
			loc: previous.loc, tz: previous.tz,
		},
		status: previous.status,
	});
	await store(entry);
	hub.broadcast({
		type: 'presence:remove', characterId: params.fromId,
	});
	hub.broadcast({
		type: 'presence:add', entry,
	});
};

/** Drop a disconnected player and announce it. */
export const leave = async (characterId: number): Promise<void> => {
	await redis.multi()
		.hdel(PRESENCE_KEY, String(characterId))
		.zrem(SEEN_KEY, String(characterId))
		.exec();
	hub.broadcast({
		type: 'presence:remove', characterId,
	});
	await broadcastOnline();
};

/** Refresh a player's last-seen so the sweep doesn't prune them. */
export const touch = (characterId: number): Promise<number> =>
	redis.zadd(SEEN_KEY, Date.now(), String(characterId));

type Platform = 'web' | 'desktop';

/** Parse a stored adoption value. Legacy entries were the bare version string,
 *  with no platform - treat those as web (they churn out within the TTL). */
const parseAdoption = (raw: string): { version: string; platform: Platform } => {
	const sep = raw.indexOf('\0');
	if (sep === -1) return {
		version: raw, platform: 'web',
	};
	return {
		version: raw.slice(0, sep), platform: raw.slice(sep + 1) === 'desktop' ? 'desktop' : 'web',
	};
};

/** Record the build and platform a client reported, refreshing its last-seen so
 *  it stays in the rolling adoption window. */
export const recordAdoption = (
	characterId: number,
	version: string,
	platform: Platform = 'web',
): Promise<unknown> =>
	redis.multi()
		.hset(ADOPTION_KEY, String(characterId), `${version}\0${platform}`)
		.zadd(ADOPTION_SEEN_KEY, Date.now(), String(characterId))
		.exec();

/** Drop version reports from characters who haven't reconnected within the TTL. */
export const sweepAdoption = async (): Promise<void> => {
	const cutoff = Date.now() - ADOPTION_TTL;
	const stale = await redis.zrangebyscore(ADOPTION_SEEN_KEY, '-inf', cutoff);
	if (!stale.length) return;
	await redis.multi()
		.hdel(ADOPTION_KEY, ...stale)
		.zrem(ADOPTION_SEEN_KEY, ...stale)
		.exec();
};

/** Version distribution across recently-active players (the rolling window),
 *  split by platform, newest version first. */
export const adoptionBreakdown = async (): Promise<
	{ version: string; count: number; web: number; desktop: number }[]
> => {
	const all = await redis.hgetall(ADOPTION_KEY);
	const counts = new Map<string, { web: number; desktop: number }>();
	for (const raw of Object.values(all)) {
		const { version, platform } = parseAdoption(raw);
		const tally = counts.get(version) ?? {
			web: 0, desktop: 0,
		};
		tally[platform]++;
		counts.set(version, tally);
	}
	return [...counts].map(([version, { web, desktop }]) => ({
		version, count: web + desktop, web, desktop,
	})).sort((a, b) => compareVersions(b.version, a.version));
};

/** Patch a connected player's entry (status / now-playing) and announce it. No-op
 *  if they have no live entry (e.g. a play whose client never opened a socket). */
export const update = async (
	characterId: number,
	patch: Partial<Pick<PresenceEntry, 'status' | 'nowPlaying'>>,
): Promise<void> => {
	const entry = await readEntry(characterId);
	if (!entry) return;
	const next = {
		...entry, ...patch,
	};
	await redis.hset(PRESENCE_KEY, String(characterId), JSON.stringify(next));
	hub.broadcast({
		type: 'presence:update', entry: next,
	});
};

/** Rebuild a connected player's card from their current row - a play moves its
 *  pp, accuracy, play count, level and rank - and announce it. No-op offline. */
export const refresh = async (character: CharacterRow, user: UserRow): Promise<void> => {
	const previous = await readEntry(character.id);
	if (!previous) return;
	const entry = await buildEntry({
		character,
		user,
		geo: {
			loc: previous.loc, tz: previous.tz,
		},
		status: previous.status,
	});
	if (previous.nowPlaying) entry.nowPlaying = previous.nowPlaying;
	await redis.hset(PRESENCE_KEY, String(character.id), JSON.stringify(entry));
	hub.broadcast({
		type: 'presence:update', entry,
	});
};

/** Prune entries whose last-seen has expired (a worker died without a clean
 *  close). Runs periodically on every worker; the deletes are idempotent. */
export const sweepPresence = async (
	/** what becomes of a character whose client vanished without closing */
	gone: (characterId: number) => Promise<void> = leave,
): Promise<void> => {
	const cutoff = Date.now() - PRESENCE_TTL;
	const stale = await redis.zrangebyscore(SEEN_KEY, '-inf', cutoff);
	for (const id of stale) await gone(Number(id));
};

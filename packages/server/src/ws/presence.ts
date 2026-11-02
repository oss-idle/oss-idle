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
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
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
import {
	enabledRulesets,
	rulesetFor,
	selectedRuleset,
} from '../rulesets/registry';
import {
	characterOfSlot,
	parseSlot,
	type Slot,
} from '../slot';
import { hub } from './hub';

/**
 * The live roster behind the community overlay. The slot an open WebSocket
 * watches adds one entry, and so does every other slot of the account that keeps
 * playing; the entry carries everything a player card / world-map dot needs. Stored
 * in Redis (shared across the cluster) as a hash keyed by slot, with a
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

/** The account's newest socket, on any worker, while it is heard from: a reconnect can
 *  land on another worker before the old socket's close, and that close must not take
 *  the account offline. Refreshed by every heartbeat. */
export const newestKey = (userId: number) => `${redisKeyPrefix}ws:newest:${userId}`;
export const NEWEST_TTL_S = PRESENCE_TTL / 1000;

/** Whether a game of the account is open. */
export const hasClient = async (userId: number): Promise<boolean> =>
	await redis.exists(newestKey(userId)) === 1;

/** A slot's ruleset, or the character's picked one where this server doesn't play it. */
const rulesetOfSlot = (character: CharacterRow, ruleset: RulesetId) =>
	enabledRulesets().some(r => r.def.id === ruleset)
		? rulesetFor(ruleset)
		: selectedRuleset(character);

const buildEntry = async (params: {
	character: CharacterRow;
	user: UserRow;
	geo: GeoResult;
	status: Status;
	ruleset: RulesetId;
}): Promise<PresenceEntry> => {
	const { character, user, geo, status } = params;
	const r = rulesetOfSlot(character, params.ruleset);
	const [totals, profile] = await Promise.all([
		getCharacterTotals(r, character.id), profileOf(r, character.id),
	]);
	const topPercent = Number(profile.pp) > 0 ? await ppTopPercent(r, character.id) : undefined;
	return {
		characterId: character.id,
		userId: user.id,
		ruleset: r.def.id,
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
		character, user, geo: {}, status: STATUS.idle, ruleset: character.ruleset,
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
		character, user, geo: {}, status: STATUS.idle, ruleset: character.ruleset,
	});
})().catch((e: unknown) => {
	console.error('[presence] MakiseBot card failed', e);
	makiseBot = undefined;
	return undefined;
});

const store = (slot: Slot, entry: PresenceEntry): Promise<unknown> =>
	redis.multi()
		.hset(PRESENCE_KEY, slot, JSON.stringify(entry))
		.zadd(SEEN_KEY, Date.now(), slot)
		.exec();

const readEntry = async (slot: Slot): Promise<PresenceEntry | undefined> => {
	const v = await redis.hget(PRESENCE_KEY, slot);
	return v ? JSON.parse(v) as PresenceEntry : undefined;
};

/** The listed slots of a character. */
const listedSlots = async (characterId: number): Promise<Slot[]> =>
	(await redis.hkeys(PRESENCE_KEY) as Slot[]).filter(slot => characterOfSlot(slot) === characterId);

/** The timezone of a connected player's location, if known. */
export const presenceTimezone = async (characterId: number): Promise<string | undefined> => {
	for (const slot of await listedSlots(characterId)) {
		const tz = (await readEntry(slot))?.tz;
		if (tz) return tz;
	}
	return undefined;
};

/** Whether this slot is on the roster. */
export const isListed = async (slot: Slot): Promise<boolean> =>
	await redis.hexists(PRESENCE_KEY, slot) === 1;

/** Which of these characters are online in any ruleset, in order. */
export const areOnline = async (characterIds: number[]): Promise<boolean[]> => {
	if (!characterIds.length) return [];
	const listed = new Set((await redis.hkeys(PRESENCE_KEY) as Slot[]).map(characterOfSlot));
	return characterIds.map(id => listed.has(id) || id === MAKISEBOT_ID);
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
	slot: Slot;
	character: CharacterRow;
	user: UserRow;
	geo: GeoResult;
}): Promise<PresenceEntry> => {
	const entry = await buildEntry({
		...params, status: STATUS.idle, ruleset: parseSlot(params.slot).ruleset,
	});
	// a restricted account never shows as online
	if (params.user.restrictedAt) return entry;
	await store(params.slot, entry);
	hub.broadcast({
		type: 'presence:add', entry,
	});
	await broadcastOnline();
	return entry;
};

/** Drop a slot off the roster and announce it. */
export const leave = async (slot: Slot): Promise<void> => {
	await redis.multi()
		.hdel(PRESENCE_KEY, slot)
		.zrem(SEEN_KEY, slot)
		.exec();
	const { characterId, ruleset } = parseSlot(slot);
	hub.broadcast({
		type: 'presence:remove', characterId, ruleset,
	});
	await broadcastOnline();
};

/** Refresh a slot's last-seen so the sweep doesn't prune it. */
export const touch = (slot: Slot): Promise<number> =>
	redis.zadd(SEEN_KEY, Date.now(), slot);

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

/** Patch a slot's entry (status / now-playing) and announce it. No-op if it has
 *  no live entry (e.g. a play whose client never opened a socket). */
export const update = async (
	slot: Slot,
	patch: Partial<Pick<PresenceEntry, 'status' | 'nowPlaying'>>,
): Promise<void> => {
	const entry = await readEntry(slot);
	if (!entry) return;
	const next = {
		...entry, ...patch,
	};
	await redis.hset(PRESENCE_KEY, slot, JSON.stringify(next));
	hub.broadcast({
		type: 'presence:update', entry: next,
	});
};

/** Rebuild a listed slot's card from the character's current row - a play moves
 *  its pp, accuracy, play count, level and rank - and announce it. */
const refreshSlot = async (slot: Slot, character: CharacterRow, user: UserRow): Promise<void> => {
	const previous = await readEntry(slot);
	if (!previous) return;
	const entry = await buildEntry({
		character,
		user,
		geo: {
			loc: previous.loc, tz: previous.tz,
		},
		status: previous.status,
		ruleset: parseSlot(slot).ruleset,
	});
	if (previous.nowPlaying) entry.nowPlaying = previous.nowPlaying;
	await redis.hset(PRESENCE_KEY, slot, JSON.stringify(entry));
	hub.broadcast({
		type: 'presence:update', entry,
	});
};

/** Rebuild every listed card of a character. No-op offline. */
export const refresh = async (character: CharacterRow, user: UserRow): Promise<void> => {
	for (const slot of await listedSlots(character.id)) await refreshSlot(slot, character, user);
};

/** Every connected player's card rebuilt from their rows: the boards were rebuilt
 *  under them (a score recalc moves every pp), and a card keeps the rank read at connect. */
export const refreshAll = async (): Promise<void> => {
	for (const slot of await redis.hkeys(PRESENCE_KEY) as Slot[]) {
		const character = await getCharacterById(characterOfSlot(slot));
		const user = character && await getUserById(character.userId);
		if (character && user) await refreshSlot(slot, character, user);
	}
};

/** Prune entries whose last-seen has expired (a worker died without a clean
 *  close). Runs periodically on every worker; the deletes are idempotent. */
export const sweepPresence = async (
	/** what becomes of a slot no client has been heard from */
	gone: (slot: Slot) => Promise<void> = leave,
): Promise<void> => {
	const cutoff = Date.now() - PRESENCE_TTL;
	const stale = await redis.zrangebyscore(SEEN_KEY, '-inf', cutoff) as Slot[];
	for (const slot of stale) await gone(slot);
};

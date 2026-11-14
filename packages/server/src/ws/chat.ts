import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { makiseBotReply } from '@oss-idle/shared/community/makiseBot';
import {
	applyReaction,
	type Reactions,
} from '@oss-idle/shared/community/reactions';
import {
	ANNOUNCE_CHANNEL,
	type ChatLine,
	DEFAULT_CHANNEL,
	LEGACY_DEFAULT_CHANNEL,
	MAX_CHAT_LENGTH,
	REPLY_QUOTE_LENGTH,
	type ServerMessage,
	TEAM_CHANNEL,
} from '@oss-idle/shared/community/wire';
import {
	type Group,
	GROUP_BADGE,
	isAdmin,
} from '@oss-idle/shared/groups';
import { LOBBY_CHANNEL } from '@oss-idle/shared/multiplayer';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { db } from '../db/client';
import { characters } from '../db/schema/character';
import { emojis } from '../db/schema/emoji';
import { isRestricted } from '../db/schema/user';
import { redisKeyPrefix } from '../env';
import {
	groupsOf,
	teamCharacters,
} from '../groups';
import { pushMedals } from '../medals';
import { count } from '../metrics';
import { redis } from '../redis';
import { enabledRulesets } from '../rulesets/registry';
import { isSupporter } from '../supporter';
import { hub } from './hub';
import {
	BOT_COLOR,
	botLine,
} from './makiseBot';
import { channelMembers } from './multiplayer';

/**
 * The chat relay + its moderation surface. Messages fan out over the socket and
 * are also kept in Redis for a rolling day (per channel: a hash id->line plus a
 * last-seen ZSET for ordering + trim) so the admin console can show history and
 * target a line for deletion. Bans (a Redis set) and timeouts (TTL keys) gate
 * who may post; a delete rewrites the stored line and pushes `chat:delete` so
 * every connected client blanks it live.
 */

// Channels a client may post to / the console may browse. Extend as more land.
const CHANNELS = new Set([DEFAULT_CHANNEL, ANNOUNCE_CHANNEL, LOBBY_CHANNEL, TEAM_CHANNEL]);

/** The browsable channel list (for the admin console). */
export const chatChannels = (): string[] => [...CHANNELS];

// Fixed-window rate limit: at most BURST messages per WINDOW per character, PMs
// counted apart from public chat.
const WINDOW_MS = 5 * 1000;
const BURST = {
	chat: 5, pm: 10, react: 15,
};

// History is a rolling 1-day window, per channel.
const HISTORY_MS = 24 * 60 * 60 * 1000;
const logKey = (channel: string): string => `${redisKeyPrefix}chat:log:${channel}`;
const idxKey = (channel: string): string => `${redisKeyPrefix}chat:idx:${channel}`;

// Moderation state. Bans persist until lifted; timeouts auto-expire via TTL.
const BAN_KEY = `${redisKeyPrefix}chat:banned`;
/** characters that ever said something, for the first-chat medal */
const CHATTED_KEY = `${redisKeyPrefix}chat:chatted`;
const timeoutKey = (userId: number): string => `${redisKeyPrefix}chat:timeout:${userId}`;

/** Chat username colours, osu!stable's: pale yellow for players, strong yellow for supporters, red
 *  for the GMT (green on the web, like osu!). Admins keep their purple. */
export const PLAYER_NAME_COLOR = '#feefb0';
export const SUPPORTER_NAME_COLOR = '#fddf43';
const GROUP_NAME_COLOR: Record<Group, string> = {
	admin: GROUP_BADGE.admin.colour, gmt: '#ff4040', bn: GROUP_BADGE.bn.colour,
};
/** `/announce` renders the whole line in this attention-grabbing red. */
const ANNOUNCE_COLOR = '#ff6b6b';
/** A deleted line's text is replaced with this, in history and live. */
const DELETED_TEXT = '<deleted>';

export const nameColor = async (userId: number): Promise<string> => {
	const [group] = await groupsOf(userId);
	if (group) return GROUP_NAME_COLOR[group];
	return await isSupporter(userId) ? SUPPORTER_NAME_COLOR : PLAYER_NAME_COLOR;
};

export const rateLimited = async (
	characterId: number, kind: keyof typeof BURST = 'chat',
): Promise<boolean> => {
	const key = `${redisKeyPrefix}${kind}:rl:${characterId}`;
	const count = await redis.incr(key);
	if (count === 1) await redis.pexpire(key, WINDOW_MS);
	return count > BURST[kind];
};

/** The user that owns a character (to key moderation off a message's sender). */
export const characterOwner = async (characterId: number): Promise<number | undefined> => {
	const [row] = await db
		.select({ userId: characters.userId })
		.from(characters)
		.where(eq(characters.id, characterId))
		.limit(1);
	return row?.userId;
};

// --- history ---

/** Append a line and trim anything older than the rolling window. */
const store = async (channel: string, line: ChatLine): Promise<void> => {
	const stale = await redis.zrangebyscore(idxKey(channel), '-inf', Date.now() - HISTORY_MS);
	const tx = redis.multi()
		.hset(logKey(channel), line.id, JSON.stringify(line))
		.zadd(idxKey(channel), line.at, line.id);
	if (stale.length) tx.hdel(logKey(channel), ...stale).zrem(idxKey(channel), ...stale);
	await tx.exec();
};

/** One retained line, if it's still in the window. */
export const chatLine = async (channel: string, id: string): Promise<ChatLine | undefined> => {
	const v = await redis.hget(logKey(channel), id);
	return v ? JSON.parse(v) as ChatLine : undefined;
};

/** Every retained line in a channel (or the latest `limit`), oldest first. */
export const chatHistory = async (channel: string, limit?: number): Promise<ChatLine[]> => {
	const since = Date.now() - HISTORY_MS;
	const ids = limit
		? (await redis.zrevrangebyscore(idxKey(channel), '+inf', since, 'LIMIT', 0, limit)).reverse()
		: await redis.zrangebyscore(idxKey(channel), since, '+inf');
	if (!ids.length) return [];
	const raw = await redis.hmget(logKey(channel), ...ids);
	return raw.filter((v): v is string => !!v).map(v => JSON.parse(v) as ChatLine);
};

// --- moderation ---

export const isBanned = async (userId: number): Promise<boolean> =>
	(await redis.sismember(BAN_KEY, String(userId))) === 1;

const isTimedOut = async (userId: number): Promise<boolean> =>
	(await redis.exists(timeoutKey(userId))) === 1;

/** Banned, timed out or restricted - may not post. */
export const isMuted = async (userId: number): Promise<boolean> =>
	(await isBanned(userId)) || (await isTimedOut(userId)) || (await isRestricted(userId));

export const setBanned = async (userId: number, banned: boolean): Promise<void> => {
	if (banned) await redis.sadd(BAN_KEY, String(userId));
	else await redis.srem(BAN_KEY, String(userId));
};

/** Mute a user for `seconds` (auto-clears when the TTL lapses). */
export const timeoutUser = async (userId: number, seconds: number): Promise<void> => {
	const ms = Math.max(1, Math.floor(seconds)) * 1000;
	await redis.set(timeoutKey(userId), Date.now() + ms, 'PX', ms);
};

export const untimeoutUser = async (userId: number): Promise<void> => {
	await redis.del(timeoutKey(userId));
};

export type ModerationStatus = { banned: boolean; timeoutUntil?: number };

/** Current moderation state for the console. */
export const moderationOf = async (userId: number): Promise<ModerationStatus> => {
	const until = await redis.get(timeoutKey(userId));
	return {
		banned: await isBanned(userId),
		timeoutUntil: until ? Number(until) : undefined,
	};
};

// --- posting ---

/** Validate, gate (mute + rate limit) and relay one chat line, storing it in
 *  history. Errors go back to the sender only. `bypassRate` is for admin sends. */
export const handleChat = async (
	from: { characterId: number; name: string; color: string },
	userId: number,
	channel: string,
	text: string,
	opts?: { bypassRate?: boolean, replyTo?: string },
): Promise<void> => {
	const trimmed = text.trim();
	if (!trimmed) return;
	if (channel === LEGACY_DEFAULT_CHANNEL) channel = DEFAULT_CHANNEL;

	// a match's channel reaches its players only, #team the team's
	const members = channel === TEAM_CHANNEL ? await teamCharacters() : await channelMembers(channel);
	if (members ? !members.includes(from.characterId) : !CHANNELS.has(channel)) {
		hub.sendTo(from.characterId, {
			type: 'error', message: `Unknown channel: ${channel}`,
		});
		return;
	}

	if ((channel === ANNOUNCE_CHANNEL && !isAdmin(await groupsOf(userId))) || await isMuted(userId)) {
		hub.sendTo(from.characterId, {
			type: 'error', message: 'You cannot post to chat right now.',
		});
		return;
	}

	if (!opts?.bypassRate && await rateLimited(from.characterId)) {
		hub.sendTo(from.characterId, {
			type: 'error', message: 'You are sending messages too fast.',
		});
		return;
	}

	const line: ChatLine = {
		id: randomUUID(),
		kind: 'player',
		channel,
		from: {
			...from, userId,
		},
		text: trimmed.slice(0, MAX_CHAT_LENGTH),
		at: Date.now(),
		replyTo: await quote(channel, opts?.replyTo),
	};

	await store(channel, line);
	void redis.sadd(CHATTED_KEY, String(from.characterId))
		.then(async added => {
			if (added) for (const r of enabledRulesets()) await pushMedals(r, from.characterId);
		})
		.catch(e => console.error('[chat] medals failed for', from.characterId, e));
	relay(line, members);

	const reply = makiseBotReply(trimmed, from.name);
	if (reply === undefined) return;
	const answer = botLine(channel, reply);
	await store(channel, answer);
	relay(answer, members);
};

/** What a reply keeps of the line it answers; nothing for a gone, deleted or system line. */
const quote = async (channel: string, id: string | undefined) => {
	const q = id ? await chatLine(channel, id) : undefined;
	if (q?.kind !== 'player' || q.text === DELETED_TEXT) return undefined;
	return {
		id: q.id,
		userId: q.from.userId,
		name: q.from.name,
		color: q.from.color,
		text: q.text.slice(0, REPLY_QUOTE_LENGTH),
	};
};

/** Send to a match's players or the team, or everyone. */
const fanOut = (msg: ServerMessage, members: number[] | undefined): void => {
	if (!members) return hub.broadcast(msg);
	for (const id of members) hub.sendTo(id, msg);
};

/** Send a line to a match's players, or everyone. */
const relay = (line: ChatLine, members: number[] | undefined): void => {
	count('activity', 'chat');
	fanOut({
		type: 'chat', line,
	}, members);
};

/** What chat moderation remembers about an account, for its deletion. */
export const forgetChatUser = async (userId: number, characterIds: number[]): Promise<void> => {
	const pipeline = redis.pipeline().srem(BAN_KEY, String(userId)).del(timeoutKey(userId));
	for (const id of characterIds) pipeline.srem(CHATTED_KEY, String(id));
	await pipeline.exec();
};

export const hasChatted = async (characterId: number): Promise<boolean> =>
	await redis.sismember(CHATTED_KEY, String(characterId)) === 1;

const systemLine = (
	channel: string, text: string, color: string, ruleset?: RulesetId, quiet?: string[],
): ChatLine => ({
	id: randomUUID(),
	kind: 'system',
	channel,
	text: text.slice(0, MAX_CHAT_LENGTH),
	color,
	at: Date.now(),
	...ruleset && { ruleset },
	...quiet && { quiet },
});

/** Broadcast a server announcement (no sender) - e.g. a #1-rank notice. The
 *  whole line renders in `color`; `quiet` parts never mention anyone. Fire-and-forget history write. */
export const announce = (
	channel: string, text: string, color: string, ruleset?: RulesetId, quiet?: string[],
): void => {
	const line = systemLine(channel, text, color, ruleset, quiet);
	void store(channel, line);
	hub.broadcast({
		type: 'chat', line,
	});
};

/** A server line in #team, for the team only. */
export const teamAnnounce = async (text: string): Promise<void> => {
	const line = systemLine(TEAM_CHANNEL, text, BOT_COLOR);
	await store(TEAM_CHANNEL, line);
	relay(line, await teamCharacters());
};

/** An admin `/announce`: a system line in the attention colour. */
export const adminAnnounce = (channel: string, text: string): void =>
	announce(channel, text, ANNOUNCE_COLOR);

// --- reactions ---

// rewrites a line only while it is still what was read: a delete, a trim or another reaction in between wins
const SWAP = `
if redis.call('hget', KEYS[1], ARGV[1]) == ARGV[2] then
	return redis.call('hset', KEYS[1], ARGV[1], ARGV[3])
end
return -1
`;

/** The emoji someone may react with: the team's, or a supporter's own or shared one. */
const usableEmoji = async (emojiId: number, userId: number): Promise<boolean> => {
	const [row] = await db.select({
		ownerId: emojis.ownerId, shared: emojis.shared, 
	})
		.from(emojis).where(eq(emojis.id, emojiId)).limit(1);
	return !!row && (!row.ownerId || row.shared || row.ownerId === userId);
};

/** A stored line's reactions with `userId`'s on or off; undefined when nothing changed or it can't take
 *  any (gone, deleted, a system line). */
const swapReaction = async (
	channel: string, id: string, emojiId: number, userId: number, on: boolean,
): Promise<Reactions | undefined> => {
	for (let tries = 0; tries < 5; tries++) {
		const raw = await redis.hget(logKey(channel), id);
		const line = raw ? JSON.parse(raw) as ChatLine : undefined;
		if (!raw || line?.kind !== 'player' || line.text === DELETED_TEXT) return undefined;
		const reactions = applyReaction(line.reactions, emojiId, userId, on);
		if (!reactions) return undefined;
		const set = await redis.eval(SWAP, 1, logKey(channel), id, raw, JSON.stringify({
			...line, reactions,
		}));
		if (set !== -1) return reactions;
	}
	return undefined;
};

/** Turn `userId`'s reaction on a stored line on or off, and tell the channel's readers the line's
 *  reactions. Who may post there may react; a muted player takes none. Quietly ignored otherwise: a
 *  reaction has nothing worth an error. */
export const handleReact = async (
	characterId: number,
	userId: number,
	channel: string,
	id: string,
	emojiId: number,
	on: boolean,
): Promise<void> => {
	if (channel === LEGACY_DEFAULT_CHANNEL) channel = DEFAULT_CHANNEL;
	const members = channel === TEAM_CHANNEL ? await teamCharacters() : await channelMembers(channel);
	if (members ? !members.includes(characterId) : !CHANNELS.has(channel)) return;
	if (await isMuted(userId) || await rateLimited(characterId, 'react')) return;
	if (on && !await usableEmoji(emojiId, userId)) return;
	const reactions = await swapReaction(channel, id, emojiId, userId, on);
	if (!reactions) return;
	fanOut({
		type: 'chat:react', channel, id, reactions,
	}, members);
};

// --- deletion ---

/** Blank the given lines in history, and the replies' quotes of them, and tell every client to do the same. */
export const deleteMessages = async (channel: string, ids: string[]): Promise<string[]> => {
	if (!ids.length) return [];
	const raw = await redis.hmget(logKey(channel), ...ids);
	const tx = redis.multi();
	const deleted: string[] = [];
	for (const v of raw) {
		if (!v) continue;
		const line = {
			...JSON.parse(v) as ChatLine, text: DELETED_TEXT, reactions: undefined,
		};
		tx.hset(logKey(channel), line.id, JSON.stringify(line));
		deleted.push(line.id);
	}
	if (!deleted.length) return [];
	const gone = new Set(deleted);
	for (const line of await chatHistory(channel)) {
		const to = line.kind === 'player' ? line.replyTo : undefined;
		if (!to || !gone.has(to.id) || gone.has(line.id)) continue;
		tx.hset(logKey(channel), line.id, JSON.stringify({
			...line, replyTo: {
				...to, text: DELETED_TEXT,
			},
		}));
	}
	await tx.exec();
	hub.broadcast({
		type: 'chat:delete', channel, ids: deleted,
	});
	return deleted;
};

/** Delete every retained line a character posted in a channel (their "day"). */
export const deleteByCharacter = async (
	channel: string,
	characterId: number,
): Promise<string[]> => {
	const lines = await chatHistory(channel);
	const ids = lines
		.filter(l => l.kind === 'player' && l.from.characterId === characterId)
		.map(l => l.id);
	return deleteMessages(channel, ids);
};

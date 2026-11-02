import { z } from 'zod';

import { characterDTO } from '../character.js';
import {
	type ValueIn,
	values,
} from '../helpers/mapped.js';
import {
	multiplayerClientMessages,
	multiplayerServerMessages,
} from '../multiplayer.js';
import {
	medalBatchDTO,
	playClientMessages,
	playServerMessages,
} from '../play.js';
import {
	queueClientMessages,
	queueServerMessages,
} from '../queue.js';
import {
	CLIENT_STATUS,
	presenceEntryDTO,
} from './presence.js';
import { reactionsDTO } from './reactions.js';

/** The default channel every signed-in player joins. */
export const DEFAULT_CHANNEL = '#oss!idle';

/** {@link DEFAULT_CHANNEL} before the rename to oss!idle, as older clients still know it. */
export const LEGACY_DEFAULT_CHANNEL = '#osu!idle';

/** The last release from before the rename to oss!idle. */
const LAST_OSU_IDLE_RELEASE = [1, 0, 1, 0];

/** Whether a client of this version knows the default channel by its old name. */
export const knowsLegacyChannel = (version: string): boolean => {
	const v = version.split('.').map(Number);
	const i = LAST_OSU_IDLE_RELEASE.findIndex((n, k) => v[k] !== n);
	return i === -1 || (v[i] ?? 0) < LAST_OSU_IDLE_RELEASE[i];
};

/** Server announcements (#1 ranks, milestones); read-only for players. */
export const ANNOUNCE_CHANNEL = '#announce';

/** The admins' and GMT's own channel, reaching only them. */
export const TEAM_CHANNEL = '#team';

/** Server-enforced cap on a chat line. */
export const MAX_CHAT_LENGTH = 2000;

/** How much of the answered line a reply keeps. */
export const REPLY_QUOTE_LENGTH = 200;

const chatLineBase = {
	id: z.string(), // server-assigned, stable across history + live so a delete can target it
	channel: z.string(),
	text: z.string(),
	at: z.number().int(), // epoch ms
	/** emoji people reacted with; absent until the first (older clients drop it) */
	reactions: reactionsDTO.optional(),
};

/** One chat line as it travels to clients. No persistence: a line exists only
 *  in flight, so a freshly connected socket sees only lines sent after it joins.
 *  `player` lines are someone typing (coloured username); `system` lines are
 *  server announcements (the whole text is coloured, no sender). */
export const chatLineDTO = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('player'),
		...chatLineBase,
		from: z.object({
			characterId: z.number().int().positive(),
			userId: z.number().int().positive(),
			name: z.string(),
			color: z.string(),
		}),
		/** the line this one answers, as it was then */
		replyTo: z.object({
			id: z.string(),
			userId: z.number().int().positive(),
			name: z.string(),
			color: z.string(),
			text: z.string(),
		}).optional(),
	}),
	z.object({
		kind: z.literal('system'),
		...chatLineBase,
		color: z.string(),
		/** a bot speaking (MakiseBot), coloured like a player's name */
		name: z.string().optional(),
		/** the bot's character, so its name opens its menu */
		from: z.object({
			characterId: z.number().int().positive(),
			userId: z.number().int().positive(),
		}).optional(),
		/** the part of `text` that opens a web platform page */
		link: z.object({
			label: z.string(),
			path: z.string(),
		}).optional(),
	}),
]);
export type ChatLine = z.infer<typeof chatLineDTO>;
/** What a reply keeps of the line it answers. */
export type ReplyQuote = NonNullable<Extract<ChatLine, { kind: 'player' }>['replyTo']>;

/** A private message, as it reaches both ends. Never stored by the server:
 *  delivered while the recipient is online, kept locally by each client. */
export const privateMessageDTO = z.object({
	id: z.string(),
	from: z.object({
		userId: z.number().int().positive(),
		characterId: z.number().int().positive(),
		name: z.string(),
		color: z.string(),
	}),
	to: z.number().int().positive(), // user id
	text: z.string(),
	at: z.number().int(), // epoch ms
});
export type PrivateMessage = z.infer<typeof privateMessageDTO>;

/**
 * Client -> server. A topic-tagged envelope so new features add a variant rather
 * than a second socket. Today: chat, self status, channel (un)subscribe.
 */
export const clientMessage = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('chat'),
		channel: z.string(),
		text: z.string().min(1).max(MAX_CHAT_LENGTH),
		/** the id of the line it answers */
		replyTo: z.string().max(64).optional(),
	}),
	// your reaction on a line, on or off
	z.object({
		type: z.literal('chat:react'),
		channel: z.string().max(64),
		id: z.string().max(64),
		emoji: z.number().int().positive(),
		on: z.boolean(),
	}),
	z.object({
		type: z.literal('status'),
		status: z.enum(values(CLIENT_STATUS)),
	}),
	// back on the main menu: award and show what was earned while away
	z.object({ type: z.literal('medals:check') }),
	z.object({
		type: z.literal('pm'),
		to: z.number().int().positive(), // user id
		text: z.string().min(1).max(MAX_CHAT_LENGTH),
	}),
	// The client's own build and platform, reported on connect so the server can
	// tally live version adoption (and web vs desktop split) across clients.
	z.object({
		type: z.literal('version'),
		version: z.string().max(32),
		platform: z.enum(['web', 'desktop']).optional(),
	}),
	z.object({
		type: z.literal('subscribe'),
		channel: z.string(),
	}),
	z.object({
		type: z.literal('unsubscribe'),
		channel: z.string(),
	}),
	...playClientMessages,
	...multiplayerClientMessages,
	...queueClientMessages,
]);
export type ClientMessage = z.infer<typeof clientMessage>;
export type ClientMessageType = ValueIn<{ [M in ClientMessage as M['type']]: M['type'] }>;

/**
 * Server -> client. Presence is delivered as a snapshot (`presence:init`) then
 * deltas; chat and the online count are pushed as they change.
 */
export const serverMessage = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('presence:init'),
		entries: z.array(presenceEntryDTO),
	}),
	z.object({
		type: z.literal('presence:add'),
		entry: presenceEntryDTO,
	}),
	z.object({
		type: z.literal('presence:update'),
		entry: presenceEntryDTO,
	}),
	z.object({
		type: z.literal('presence:remove'),
		characterId: z.number().int().positive(),
		ruleset: presenceEntryDTO.shape.ruleset,
	}),
	z.object({
		type: z.literal('chat'),
		line: chatLineDTO,
	}),
	// The default channel's latest lines, on connect.
	z.object({
		type: z.literal('chat:history'),
		lines: z.array(chatLineDTO),
	}),
	// Moderation: replace these lines' text with a deleted marker, live. Sent when
	// an admin deletes messages (or times out / bans, which also deletes).
	z.object({
		type: z.literal('chat:delete'),
		channel: z.string(),
		ids: z.array(z.string()),
	}),
	// a line's reactions changed: all of them, as they are now
	z.object({
		type: z.literal('chat:react'),
		channel: z.string(),
		id: z.string(),
		reactions: reactionsDTO,
	}),
	z.object({
		type: z.literal('online'),
		count: z.number().int().min(0),
	}),
	// Sent to the recipient (when it may be delivered) and always echoed back to
	// the sender, so a refused message looks exactly like a delivered one.
	z.object({
		type: z.literal('pm'),
		message: privateMessageDTO,
	}),
	// The live beatmap catalog changed (a map went live, a diff was (un)ranked,
	// a set was removed): drop any cached manifest and refetch on next use.
	z.object({ type: z.literal('catalog:invalidate') }),
	// An emoji was added, renamed or removed: refetch the list.
	z.object({ type: z.literal('emoji:invalidate') }),
	// The server's running version, pushed on connect. A version bump only ships
	// by restarting the server (which drops the socket), so a reconnect carrying
	// a different version is itself the "update available" signal - no polling.
	z.object({
		type: z.literal('version'),
		version: z.string(),
	}),
	// The account's character as the server has it. Pushed on connect and after
	// every change to the row, so no interface has to ask for it and none of
	// them can drift apart.
	z.object({
		type: z.literal('character'),
		character: characterDTO,
	}),
	// Medals earned away from a play's result (a first chat, a purchase).
	z.object({
		type: z.literal('medals'),
		medals: medalBatchDTO,
	}),
	// The team answered one of the account's bug reports.
	z.object({
		type: z.literal('bug:reply'),
		id: z.number().int(),
		title: z.string(),
	}),
	z.object({
		type: z.literal('error'),
		message: z.string(),
	}),
	...playServerMessages,
	...multiplayerServerMessages,
	...queueServerMessages,
]);
export type ServerMessage = z.infer<typeof serverMessage>;

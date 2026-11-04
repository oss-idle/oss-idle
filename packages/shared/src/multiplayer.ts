import { z } from 'zod';

import { modsSchema } from './mods.js';
import { rateSchema } from './rate.js';
import { scoreDTO } from './score.js';

/**
 * Multiplayer matches (osu!'s lobby + match setup). A match only gathers
 * players: when the host starts it, every ready player's character gets a
 * normal ranked play of the match's map, started at the same moment. These are
 * the `mp:*` variants composed into the community socket's unions.
 */

export const MAX_SLOTS = 16;
export const MIN_SLOTS = 2;
export const MAX_MATCH_NAME = 50;
export const MAX_MATCH_PASSWORD = 50;

/** What a match's history records. `close` = the last player left. */
export const MATCH_EVENT = ['create', 'join', 'leave', 'kick', 'host', 'game', 'close'] as const;
export type MatchEvent = typeof MATCH_EVENT[number];

/** The lobby chat channel; each match also has its own `#mp_<id>` channel. */
export const LOBBY_CHANNEL = '#lobby';
export const matchChannel = (id: number): string => `#mp_${id}`;
export const isMatchChannel = (channel: string): boolean => channel.startsWith('#mp_');

export const matchSlotDTO = z.discriminatedUnion('state', [
	z.object({ state: z.literal('open') }),
	z.object({ state: z.literal('locked') }),
	z.object({
		state: z.literal('player'),
		characterId: z.number().int(),
		ready: z.boolean(),
		noMap: z.boolean(),
		/** in the round being played */
		playing: z.boolean(),
		/** the rate this player plays at: everyone picks their own */
		rate: rateSchema.optional(),
		/** and their own mods */
		mods: modsSchema.optional(),
	}),
]);
export type MatchSlot = z.infer<typeof matchSlotDTO>;
export type PlayerSlot = Extract<MatchSlot, { state: 'player' }>;

export const matchBeatmapDTO = z.object({
	id: z.number().int(),
	setId: z.number().int(),
	artist: z.string(),
	title: z.string(),
	version: z.string(),
	creator: z.string(),
	sr: z.number(),
});
export type MatchBeatmap = z.infer<typeof matchBeatmapDTO>;

/** One player's standing in a round: live (score, combo) or final (maxCombo). */
export const roundScoreDTO = z.object({
	characterId: z.number().int(),
	score: z.number(),
	combo: z.number().int(),
	failed: z.boolean(),
	accuracy: z.number().optional(),
	/** the full play, once the round is over: what its result screen shows, failed or not */
	result: scoreDTO.omit({
		id: true, unranked: true, 
	}).optional(),
});
export type RoundScore = z.infer<typeof roundScoreDTO>;

/** The last round played, shown on the result screen. */
export const lastRoundDTO = z.object({
	beatmapId: z.number().int(),
	startedAt: z.number(),
	results: z.array(roundScoreDTO),
});
export type LastRound = z.infer<typeof lastRoundDTO>;

export const matchDTO = z.object({
	id: z.number().int(),
	name: z.string(),
	/** a password is needed to join */
	locked: z.boolean(),
	hostId: z.number().int(),
	beatmap: matchBeatmapDTO.optional(),
	/** the host is in song select picking the next map */
	changingBeatmap: z.boolean(),
	slots: z.array(matchSlotDTO),
	playing: z.boolean(),
	lastRound: lastRoundDTO.optional(),
});
export type Match = z.infer<typeof matchDTO>;

export const matchPlayers = (match: Match): PlayerSlot[] =>
	match.slots.filter((s): s is PlayerSlot => s.state === 'player');

/** The slots a match was created with: the rest of the 16 are locked. */
export const matchSize = (match: Match): number =>
	match.slots.filter(s => s.state !== 'locked').length;

const matchName = z.string().trim().min(1).max(MAX_MATCH_NAME);
const password = z.string().max(MAX_MATCH_PASSWORD);

export const multiplayerClientMessages = [
	z.object({ type: z.literal('mp:list') }),
	z.object({
		type: z.literal('mp:create'),
		name: matchName,
		password,
		/** anyone may read the match history, not only its players */
		isPublic: z.boolean(),
		/** the map selected when it was created */
		beatmapId: z.number().int().optional(),
		size: z.number().int().min(MIN_SLOTS).max(MAX_SLOTS),
	}),
	z.object({
		type: z.literal('mp:join'),
		id: z.number().int(),
		password,
	}),
	z.object({ type: z.literal('mp:leave') }),
	z.object({
		type: z.literal('mp:ready'),
		ready: z.boolean(),
	}),
	z.object({
		type: z.literal('mp:noMap'),
		noMap: z.boolean(),
	}),
	z.object({
		type: z.literal('mp:rate'),
		rate: rateSchema,
	}),
	z.object({
		type: z.literal('mp:mods'),
		mods: modsSchema,
	}),
	/** move to another open slot */
	z.object({
		type: z.literal('mp:slot'),
		slot: z.number().int().min(0).max(MAX_SLOTS - 1),
	}),
	// host only below
	/** absent = unchanged */
	z.object({
		type: z.literal('mp:settings'),
		name: matchName.optional(),
		password: password.optional(),
	}),
	z.object({
		type: z.literal('mp:beatmap'),
		beatmapId: z.number().int(),
	}),
	/** the host went to song select to pick a map, or came back without one */
	z.object({
		type: z.literal('mp:changing'),
		changing: z.boolean(),
	}),
	z.object({
		type: z.literal('mp:lock'),
		slot: z.number().int().min(0).max(MAX_SLOTS - 1),
	}),
	z.object({ type: z.literal('mp:start') }),
	z.object({
		type: z.literal('mp:host'),
		characterId: z.number().int(),
	}),
	z.object({
		type: z.literal('mp:kick'),
		characterId: z.number().int(),
	}),
	/** stream the live scores of the round being played (the in-game scoreboard) */
	z.object({
		type: z.literal('mp:watch'),
		on: z.boolean(),
	}),
] as const;

export const multiplayerServerMessages = [
	z.object({
		type: z.literal('mp:list'),
		matches: z.array(matchDTO),
	}),
	/** a match changed - broadcast to everyone, the lobby lists it */
	z.object({
		type: z.literal('mp:update'),
		match: matchDTO,
	}),
	z.object({
		type: z.literal('mp:scores'),
		scores: z.array(roundScoreDTO),
	}),
	z.object({
		type: z.literal('mp:remove'),
		id: z.number().int(),
	}),
	/** the answer to create/join, and pushed on connect while in a match */
	z.object({
		type: z.literal('mp:joined'),
		match: matchDTO.optional(),
		/** why a join was refused */
		reason: z.enum(['full', 'password', 'gone', 'playing', 'restricted']).optional(),
	}),
] as const;

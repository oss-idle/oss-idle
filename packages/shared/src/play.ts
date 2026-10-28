import { z } from 'zod';

import { Grades } from './grade.js';
import { modsSchema } from './mods.js';
import { rateSchema } from './rate.js';
import { RULESET_IDS } from './rulesets/ids.js';
import { scoreDTO } from './score.js';

/** The silence before a play's first note: every play's timeline starts here. */
export const LEAD_IN_MS = 2000;

/**
 * The play protocol. Ranked plays are server-authoritative end to end and ride
 * the community WebSocket: these are the play-scoped variants composed into the
 * shared `clientMessage`/`serverMessage` unions (community/wire.ts). The flow:
 * `play:start` starts-or-joins, `play:watch` arms a server-side feed that pushes
 * `play:offsets` (gameplay) or `play:state` checkpoints (resume banner), and
 * skip/abort/result are one-shot commands. State changes (start, finish, abort)
 * are pushed to every one of the character's sockets.
 */

/** Song ms between two strain gauge samples. */
export const STRAIN_EVERY_MS = 250;

/** The strain gauges every `every` ms of song time from `from`: each sample the
 *  play's ruleset's gauged skills' strain, 0-100, in `skills` order. */
export const strainSamplesDTO = z.object({
	from: z.number(),
	every: z.number().int().positive(),
	skills: z.array(z.string()),
	values: z.array(z.array(z.number().int().min(0).max(100))),
});
export type StrainSamples = z.infer<typeof strainSamplesDTO>;

/** The samples of `s` after song time `after`, up to and with `upTo`: a chunk's share. */
export const strainsBetween = (
	s: StrainSamples, after: number, upTo: number,
): StrainSamples | undefined => {
	const first = Math.max(0, Math.floor((after - s.from) / s.every) + 1);
	const last = Math.min(s.values.length - 1, Math.floor((upTo - s.from) / s.every));
	if (last < first) return undefined;
	return {
		...s, from: s.from + first * s.every, values: s.values.slice(first, last + 1),
	};
};

/** A slice of the replay stream: the offsets revealed so far, the resume
 *  cursor, and whether every offset has been delivered. An offset is the play's
 *  ruleset's own: only that ruleset's client reads one. The strain gauge samples
 *  up to the last offset revealed come with it, gated the same way. */
const offsetChunk = {
	offsets: z.array(z.unknown()),
	next: z.number().int().min(0),
	done: z.boolean(),
	strains: strainSamplesDTO.optional(),
};

/** Outcome of `play:start`. `ranked` carries everything the client needs to
 *  replay the play seeked to its live position; timestamps are server-clock ms
 *  (`serverNow` lets the client absorb clock skew). */
export const playStartResultDTO = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('ranked'),
		/** the map's ruleset: it plays the replay back */
		ruleset: z.enum(RULESET_IDS),
		/** joined the play already in progress (spectate) instead of starting */
		joined: z.boolean(),
		token: z.string(),
		/** what is actually being played - a join can differ from the request */
		beatmapId: z.number().int(),
		/** and at which rate - the client replays the map sped up the same way */
		rate: rateSchema,
		/** and with which mods - the client judges the replay with the same windows */
		mods: modsSchema.default([]),
		startedAt: z.number(),
		endsAt: z.number(),
		serverNow: z.number(),
		/** how tired the character plays it, 0 rested to 1 exhausted */
		fatigue: z.number().min(0).max(1).default(0),
		/** how warmed up, 0 cold to 1 warm */
		warmup: z.number().min(0).max(1).default(1),
		/** where the character sits on the warm-up bar, 0 cold to 1 exhausted */
		warmupBar: z.number().min(0).max(1).optional(),
		/** which way the map moves the warm-up bar, -3 cooling to 3 warming */
		warmupTrend: z.number().int().min(-3).max(3).optional(),
		...offsetChunk,
	}),
	// played on the client, as tired as the character is now; it adds no fatigue
	z.object({
		status: z.literal('unranked'),
		fatigue: z.number().min(0).max(1).default(0),
		warmup: z.number().min(0).max(1).default(1),
		warmupBar: z.number().min(0).max(1).optional(),
	}),
	z.object({ status: z.literal('refused') }),
	// the account is restricted: no play at all, not even unranked
	z.object({ status: z.literal('restricted') }),
	// seated in a match: only the match's rounds can be played
	z.object({ status: z.literal('inMatch') }),
]);
export type PlayStartResult = z.infer<typeof playStartResultDTO>;

/** What (if anything) the character is playing. Pushed on connect, on every
 *  play start/finish/abort, and while a state watch is armed. `accuracy`/
 *  `grade` are the score checkpoint at the live position. */
export const playStateDTO = z.discriminatedUnion('phase', [
	z.object({
		phase: z.literal('active'),
		token: z.string(),
		beatmapId: z.number().int(),
		rate: rateSchema,
		mods: modsSchema.default([]),
		startedAt: z.number(),
		endsAt: z.number(),
		serverNow: z.number(),
		accuracy: z.number().optional(),
		grade: z.enum(Grades).optional(),
	}),
	z.object({
		phase: z.literal('finished'),
		token: z.string(),
		/** finalised server-side (the sweep) and not yet surfaced to any client */
		notify: z.boolean(),
		/** SD / PF retry the map on a fail */
		failed: z.boolean().optional(),
	}),
	z.object({ phase: z.literal('idle') }),
]);
export type PlayState = z.infer<typeof playStateDTO>;

/** A skill's level/xp before and after the play - the sim's `SkillProgress`. */
export const skillGainDTO = z.object({
	/** one of the play's ruleset's skills */
	skill: z.string(),
	gained: z.number(),
	fromLevel: z.number().int(),
	fromXp: z.number(),
	toLevel: z.number().int(),
	toXp: z.number(),
	levels: z.number().int(),
});
export type SkillGain = z.infer<typeof skillGainDTO>;

/** What the play changed on the character's profile: ranked score, pp and
 *  global (pp) rank, before vs after. `rank` is positive when the player
 *  climbed. */
export const playDeltasDTO = z.object({
	rank: z.number().int(),
	rankedScore: z.number(),
	pp: z.number(),
});
export type PlayDeltas = z.infer<typeof playDeltasDTO>;

/** Medals just unlocked, and how many the character holds with them. */
export const medalBatchDTO = z.object({
	ids: z.array(z.string()),
	held: z.number().int(),
});
export type MedalBatch = z.infer<typeof medalBatchDTO>;

/** Outcome of `play:result`. Not-ok reasons: `unknown` = no such play/result,
 *  `cache-miss` = already surfaced elsewhere, `unfinalized` = the finalise
 *  failed, `tooSoon` = the play hasn't ended yet. */
export const playResultDTO = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		failed: z.boolean(),
		score: scoreDTO.optional(),
		gains: z.array(skillGainDTO).optional(),
		deltas: playDeltasDTO.optional(),
		/** medals this play unlocked - only when asked for with `medals` */
		medals: z.array(z.string()).optional(),
		/** how many medals the character holds, these included */
		medalsHeld: z.number().int().optional(),
	}),
	z.object({
		ok: z.literal(false),
		reason: z.enum(['unknown', 'cache-miss', 'unfinalized', 'tooSoon']),
	}),
]);
export type PlayResult = z.infer<typeof playResultDTO>;

/** Client -> server play variants. */
export const playClientMessages = [
	// start a ranked play, or join the one already in progress (start-or-join)
	z.object({
		type: z.literal('play:start'),
		beatmapId: z.number().int(),
		/** debug only, pinned to 1 in production: scales the play's xp so
		 *  progression thresholds are reachable while testing. Deliberately
		 *  unbounded - a ceiling here rejects the whole start message, so a debug
		 *  knob could stop a song from starting at all. */
		xpMultiplier: z.number().int().positive().optional(),
		/** held to what the character has unlocked; x1 when left out */
		rate: rateSchema.optional(),
		/** NF answers unranked: the client plays it locally */
		mods: modsSchema.optional(),
	}),
	// arm this socket's play feed: with `next`, stream replay offsets from that
	// cursor; without it, push live state checkpoints (the resume banner)
	z.object({
		type: z.literal('play:watch'),
		token: z.string(),
		next: z.number().int().min(0).optional(),
	}),
	z.object({ type: z.literal('play:unwatch') }),
	// lead-in skip: shift the play's timeline so it finalises earlier
	z.object({
		type: z.literal('play:skip'),
		token: z.string(),
	}),
	// debug only: end the play now, so its authoritative result can be read
	// without waiting out the map in real time. Refused on a production server.
	z.object({
		type: z.literal('play:finish'),
		token: z.string(),
		/** where the client's replay got to, so the answer carries the rest */
		next: z.number(),
	}),
	// quit: drop the play without submitting
	z.object({
		type: z.literal('play:abort'),
		token: z.string(),
	}),
	z.object({
		type: z.literal('play:result'),
		token: z.string(),
		forceSee: z.boolean().optional(),
		/** the result screen is about to show this result: award its medals.
		 *  Catches up on everything earned since the last award. */
		medals: z.boolean().optional(),
	}),
] as const;

/** Server -> client play variants. */
export const playServerMessages = [
	z.object({
		type: z.literal('play:start'),
		result: playStartResultDTO,
	}),
	z.object({
		type: z.literal('play:state'),
		state: playStateDTO,
	}),
	z.object({
		type: z.literal('play:offsets'),
		token: z.string(),
		...offsetChunk,
	}),
	// the play was aborted (possibly from another device) - stop spectating it
	z.object({
		type: z.literal('play:aborted'),
		token: z.string(),
	}),
	z.object({
		type: z.literal('play:result'),
		token: z.string(),
		result: playResultDTO,
	}),
] as const;

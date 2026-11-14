import { z } from 'zod';

import {
	mapped,
	type ValueIn,
} from './helpers/mapped.js';
import { modsSchema } from './mods.js';
import { rateSchema } from './rate.js';

/**
 * The play queue lives on the server, one per character, and the server chains
 * it - game open or not. Every client is a view of it: an edit replaces the
 * whole list (last write wins) and the server pushes `queue:state` to every one
 * of the character's sockets.
 */

/** How song select builds the queue. `DISABLED` builds none and keeps it paused. */
export const AutopilotModes = [
	'DISABLED',
	'PLAYLIST',
	'NEXT',
	'SHUFFLE',
	'LOOP',
] as const;
export const AUTOPILOT_MODE = mapped(AutopilotModes);
export type AutopilotMode = ValueIn<typeof AUTOPILOT_MODE>;

export const AUTOPILOT_DELAY = {
	/** pbeMin: only the PBE goes below min */
	min: 3, pbeMin: 1, max: 120, default: 30,
} as const;

export const MAX_QUEUE = 5000;
export const MAX_REPEAT = 100;

/** Hours a character keeps playing once its game is closed. */
export const AWAY_HOURS = 12;
export const SUPPORTER_AWAY_HOURS = 24;

export const queueEntryDTO = z.object({
	beatmapId: z.number().int(),
	/** a playlist's locked rate; otherwise the character's own rate */
	rate: rateSchema.optional(),
	/** the mods locked with that rate; otherwise the character's own mods */
	mods: modsSchema.optional(),
	/** plays in a row before it goes to the back */
	repeat: z.number().int().min(1).max(MAX_REPEAT).optional(),
	/** how many of the run have started */
	played: z.number().int().min(0).max(MAX_REPEAT).optional(),
});
export type QueueEntry = z.infer<typeof queueEntryDTO>;

/** An entry by its place among the copies of the same map: the same on every
 *  device, since a device knows all of a map's copies or none. */
const nth = z.number().int().min(0).max(MAX_QUEUE).optional();
const queueEntryRefDTO = queueEntryDTO.extend({ nth });
export type QueueEntryRef = z.infer<typeof queueEntryRefDTO>;

export const queuePrefsDTO = z.object({
	mode: z.enum(AutopilotModes),
	delay: z.number().int().min(AUTOPILOT_DELAY.pbeMin).max(AUTOPILOT_DELAY.max),
	rate: rateSchema,
	mods: modsSchema,
	/** the account's: the character plays on once the game is closed */
	keepPlaying: z.boolean(),
	/** a map that played leaves the queue: it stops after the last one */
	playOnce: z.boolean(),
	/** PBE: the character's plays skip to the end */
	autoSkip: z.boolean().optional(),
});
export type QueuePrefs = z.infer<typeof queuePrefsDTO>;

/** Where the queue came from, for display and to reopen its song select group. */
export const queueSourceDTO = z.object({
	label: z.string().max(200),
	/** unset when the queue was started by adding a map to it */
	mode: z.enum(AutopilotModes).optional(),
	groupKey: z.string().max(200).optional(),
});
export type QueueSource = z.infer<typeof queueSourceDTO>;

/** Edits name entries rather than positions: a device shows only the maps it
 *  knows, and must not drop the ones it doesn't. */
export const queueEditDTO = z.discriminatedUnion('op', [
	z.object({
		op: z.literal('append'), entry: queueEntryDTO, label: z.string().max(200).optional(),
	}),
	z.object({
		op: z.literal('playNext'), entry: queueEntryDTO, label: z.string().max(200).optional(),
	}),
	z.object({
		op: z.literal('remove'), entry: queueEntryRefDTO,
	}),
	// `before` unset: to the back
	z.object({
		op: z.literal('move'), entry: queueEntryRefDTO, before: queueEntryRefDTO.optional(),
	}),
	// a copy right after it
	z.object({
		op: z.literal('duplicate'), entry: queueEntryRefDTO,
	}),
	z.object({
		op: z.literal('repeat'), entry: queueEntryRefDTO, repeat: z.number().int().min(1).max(MAX_REPEAT),
	}),
	z.object({ op: z.literal('clear') }),
]);
export type QueueEdit = z.infer<typeof queueEditDTO>;

export const queueStateDTO = queueSourceDTO.extend({
	entries: z.array(queueEntryDTO).max(MAX_QUEUE),
	paused: z.boolean(),
	/** server clock: when the next map starts, while one is scheduled */
	nextAt: z.number().optional(),
	/** ms left of the countdown when it was paused */
	remaining: z.number().optional(),
	prefs: queuePrefsDTO,
	serverNow: z.number(),
});
export type QueueState = z.infer<typeof queueStateDTO>;

export const queueClientMessages = [
	// a fresh queue, built from song select
	z.object({
		type: z.literal('queue:set'),
		source: queueSourceDTO,
		entries: z.array(queueEntryDTO).max(MAX_QUEUE),
	}),
	z.object({
		type: z.literal('queue:edit'),
		edit: queueEditDTO,
	}),
	z.object({
		type: z.literal('queue:pause'),
		paused: z.boolean(),
	}),
	// unpause and start the head now
	z.object({ type: z.literal('queue:start') }),
	// drop the running play and start the head now
	z.object({ type: z.literal('queue:skip') }),
	z.object({
		type: z.literal('queue:prefs'),
		prefs: queuePrefsDTO.partial(),
	}),
	// take the unranked head the server offered: this client plays it locally
	z.object({
		type: z.literal('queue:claim'),
		serial: z.number().int(),
	}),
	// this client runs a local play for `ms`; the queue waits for it
	z.object({
		type: z.literal('queue:localStart'),
		ms: z.number().int().min(0).max(24 * 3600_000),
	}),
	// the result screen is up: the next map waits `ms` from now
	z.object({
		type: z.literal('queue:hold'),
		ms: z.number().int().min(0).max(5 * 60_000),
	}),
	// the local play ended early (abort / skip)
	z.object({
		type: z.literal('queue:localEnd'),
		skip: z.boolean().optional(),
	}),
] as const;

export const queueServerMessages = [
	z.object({
		type: z.literal('queue:state'),
		state: queueStateDTO,
	}),
	// the head is not ranked: a connected client has to play it locally
	z.object({
		type: z.literal('queue:offer'),
		serial: z.number().int(),
		entry: queueEntryDTO,
	}),
	z.object({
		type: z.literal('queue:claim'),
		serial: z.number().int(),
		ok: z.boolean(),
	}),
	// the server paused the queue on its own
	z.object({
		type: z.literal('queue:stopped'),
		reason: z.enum(['failed', 'restricted', 'inMatch']),
	}),
] as const;

export const sameEntry = (a: QueueEntry, b: QueueEntry) =>
	a.beatmapId === b.beatmapId && a.rate === b.rate
	&& (a.mods ?? []).join() === (b.mods ?? []).join();

type Repeats = Pick<QueueEntry, 'repeat' | 'played'>;

/** One pass through the queue in ms: each map as many times as it has left. */
export const passMs = <T extends Repeats>(
	entries: readonly T[], playMs: (entry: T) => number,
): number =>
	entries.reduce((sum, e) => sum + ((e.repeat ?? 1) - (e.played ?? 0)) * playMs(e), 0);

/** A LOOP queue is one map played forever: it loops either way. */
export const playsOnce = (playOnce: boolean, mode?: AutopilotMode): boolean =>
	playOnce && mode !== AUTOPILOT_MODE.LOOP;

/** The map at `at` just started: it stays where it is until its repeats are
 *  done, then goes to the back - or out, with `once`. */
export const advanceQueue = <T extends Repeats>(
	entries: T[], at: number, once = false,
): T[] => {
	const entry = entries[at];
	if (!entry) return entries;
	const played = (entry.played ?? 0) + 1;
	if (played < (entry.repeat ?? 1)) return entries.map((e, i) => i === at ? {
		...e, played, 
	} : e);
	if (once) return [...entries.slice(0, at), ...entries.slice(at + 1)];
	return [...entries.slice(0, at), ...entries.slice(at + 1), {
		...entry, played: undefined, 
	}];
};

/** Named rather than assumed to be the head: the queue may have been edited
 *  while it started. */
export const rotateQueue = (
	entries: QueueEntry[], played: QueueEntry, once = false,
): QueueEntry[] =>
	advanceQueue(entries, entries.findIndex(e => sameEntry(e, played)), once);

/** When the head starts, `ms` from now - or never, while something holds the queue. */
export const nextStart = (
	q: { paused: boolean; entries: unknown[] }, mode: AutopilotMode, now: number, ms: number,
): number | undefined =>
	q.paused || mode === AUTOPILOT_MODE.DISABLED || !q.entries.length ? undefined : now + ms;

const find = (entries: QueueEntry[], ref: QueueEntryRef): number => {
	let nth = ref.nth ?? 0;
	return entries.findIndex(e => sameEntry(e, ref) && nth-- === 0);
};

const without = (entries: QueueEntry[], at: number): QueueEntry[] =>
	at < 0 ? entries : [...entries.slice(0, at), ...entries.slice(at + 1)];

/** Played `repeat` times in a row; a run already past it ends with this play. */
export const withRepeat = <T extends Repeats>(entry: T, repeat: number): T => ({
	...entry,
	repeat: repeat > 1 ? repeat : undefined,
	played: (entry.played ?? 0) < repeat ? entry.played : undefined,
});

const moveEntry = (entries: QueueEntry[], from: number, before: number): QueueEntry[] => {
	if (from < 0) return entries;
	const rest = without(entries, from);
	const at = before < 0 ? -1 : rest.indexOf(entries[before]);
	return at < 0 ? [...rest, entries[from]] : rest.toSpliced(at, 0, entries[from]);
};

const duplicateEntry = (entries: QueueEntry[], at: number): QueueEntry[] =>
	at < 0 || entries.length >= MAX_QUEUE ? entries : entries.toSpliced(at + 1, 0, {
		...entries[at], played: undefined,
	});

export const applyQueueEdit = (entries: QueueEntry[], edit: QueueEdit): QueueEntry[] => {
	switch (edit.op) {
		case 'append':
			return [...entries, edit.entry].slice(0, MAX_QUEUE);
		case 'playNext': {
			// one already queued moves up; its other copies keep their places
			const at = find(entries, edit.entry);
			return [entries[at] ?? edit.entry, ...without(entries, at)].slice(0, MAX_QUEUE);
		}
		case 'remove':
			return without(entries, find(entries, edit.entry));
		case 'move':
			return moveEntry(entries, find(entries, edit.entry), edit.before ? find(entries, edit.before) : -1);
		case 'duplicate':
			return duplicateEntry(entries, find(entries, edit.entry));
		case 'repeat': {
			const at = find(entries, edit.entry);
			return at < 0 ? entries : entries.with(at, withRepeat(entries[at], edit.repeat));
		}
		case 'clear':
			return [];
	}
};

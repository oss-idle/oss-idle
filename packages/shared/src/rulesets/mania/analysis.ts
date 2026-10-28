import type { Judgement } from './judgement.js';
import type { HitWindows } from './scoring.js';

/** A judged note in the strain view: song time, signed offset (none for a miss),
 *  judgement, and the HP right after it where the series has one. */
export type DebugHit = [time: number, offset: number | null, judgement: Judgement, hp?: number];

/** One skill played alone over a map, or the combined play the bot makes. */
export type DebugSeries = {
	name: string,
	/** the level it played at, for a single skill */
	level?: number,
	/** the xp it would gain from the combined play (combined: the total) */
	xp?: number,
	/** song time its HP first hit 0, if it failed */
	failMs?: number,
	/** an extra 0-1 curve over the graph, as [time, value] (consistency: the
	 *  pressure its choke roll saw on each note) */
	overlay?: [number, number][],
	hits: DebugHit[],
	score: { score: number, accuracy: number, counts: Record<Judgement, number> },
};

/** The strain view's analysis of a map: every skill alone, then combined. */
export type DebugAnalysis = {
	windows: HitWindows,
	songEndMs: number,
	series: DebugSeries[],
};

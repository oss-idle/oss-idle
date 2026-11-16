
/**
 * Mania scroll model - osu!stable behaviour.
 *
 * Scroll speed at a moment in time is:
 *     speed(t) = (bpm(t) / baseBpm) * sv(t)
 *
 * - baseBpm is the map's nominal BPM, i.e. the BPM of the beat length that
 *   covers the most time, unclamped (`beatmap.bpmUnlimited`): clamped, a map's
 *   many 0-BPM stops all read as 1 BPM and win it. The bulk
 *   of the map scrolls at "1x" and tempo changes scroll proportionally faster /
 *   slower (a 2x-BPM section scrolls twice as fast). Stable does scale scroll
 *   speed by BPM - this is *not* a lazer-only behaviour.
 * - sv(t) is the inherited ("green line") slider-velocity multiplier, clamped
 *   to [0.01, 10]. Stable scrolls 0.01x where osu-classes floors at 0.1x
 *   (measured on Cubibibibism's 0.01x lines); fully unclamped values made
 *   heavy-SV maps render incorrectly.
 *
 * To position notes correctly even across speed changes, we integrate speed
 * over time into a cumulative "scroll distance" D(t). A note at time T sits at
 * (D(T) - D(now)) distance from the judgement line; both endpoints of a long
 * note are positioned the same way, so SV stretches/compresses them naturally.
 */

import type {
	Beatmap,
	EffectPoint,
	TimingPoint,
} from 'osu-classes';

import { redLinesOf } from '../../osu/controlPointPatch.js';

interface Segment {
	time: number
	/** cumulative scroll distance at `time` */
	cumulative: number
	/** constant speed from `time` until the next segment */
	speed: number
}

export interface Barline {
	time: number
	/** scroll position, worked out once */
	pos: number
}

type Red = Pick<TimingPoint, 'startTime' | 'bpm' | 'beatLengthUnlimited'>;

/** Bounds BPM-trick speeds (red lines down to 6e-96ms) so later positions keep their
 *  precision. Teleports up to 1e10x stay whole: a hold across one glitches as in stable. */
const MAX_SPEED = 1e12;

/** The red line's own BPM: stable scrolls by it unclamped, which is how mappers
 *  teleport (tiny beat length) and stop (huge one). */
const bpmOf = (red: Red) =>
	(red.beatLengthUnlimited > 0 ? 60000 / red.beatLengthUnlimited : red.bpm);
type Green = Pick<EffectPoint, 'startTime' | 'scrollSpeedUnlimited'>;

const SV_MIN = 0.01;
const SV_MAX = 10;

/** What the scroll is built from: a beatmap, or a chart's points in the editor. */
export type ScrollSource = {
	bpmUnlimited: number,
	difficulty: { clockRate: number },
	controlPoints: { timingPoints: Red[], effectPoints: Green[] },
};

export interface SpeedChange {
	time: number
	/** scroll speed multiplier in effect from this time until the next change */
	speed: number
}

export class ScrollModel {
	readonly baseBpm: number;
	private readonly segments: Segment[];
	/** every point at which the scroll speed changes (BPM section and/or SV) */
	readonly speedChanges: SpeedChange[];

	/** `rate` speeds the map up: its times shrink, the scroll speed stays the same,
	 *  so the notes come denser. */
	constructor(beatmap: ScrollSource, rate = 1) {
		const reds = beatmap.controlPoints.timingPoints;
		const greens = beatmap.controlPoints.effectPoints;
		// The map's nominal BPM (most-common beat length) is the 1x reference, as
		// stable uses. `bpmUnlimited` already folds in the active clock-rate; we
		// keep raw beatmap time everywhere else, so divide it back out.
		this.baseBpm = beatmap.bpmUnlimited / beatmap.difficulty.clockRate;
		this.segments = this.buildSegments(reds, greens).map(s => ({
			time: s.time / rate, cumulative: s.cumulative / rate, speed: s.speed,
		}));
		this.speedChanges = this.segments.map((s) => ({
			time: s.time, speed: s.speed, 
		}));
	}

	private buildSegments(reds: Red[], greens: Green[]): Segment[] {
		// Speed changes at both red lines (BPM) and green lines (SV).
		const times = new Set<number>([0]);
		for (const r of reds) times.add(r.startTime);
		for (const g of greens) times.add(g.startTime);
		const sorted = [...times].sort((a, b) => a - b);

		// reds/greens are sorted by startTime and `sorted` is ascending, so the
		// active red/green only ever moves forward: walk all three with monotonic
		// pointers. (Per-segment linear scans for the active point made this
		// O(segments × control points) - multi-second to build on SV-heavy maps
		// such as Singularity's ~23k points.)
		const segments: Segment[] = [];
		let ri = -1;
		let gi = -1;
		let cumulative = 0;
		let prevTime = sorted[0];
		let prevSpeed = 0;

		for (let i = 0; i < sorted.length; i++) {
			const t = sorted[i];
			while (ri + 1 < reds.length && reds[ri + 1].startTime <= t) ri++;
			while (gi + 1 < greens.length && greens[gi + 1].startTime <= t) gi++;
			const bpm = ri >= 0 ? bpmOf(reds[ri]) : this.baseBpm;
			const sv = gi >= 0 ? Math.min(SV_MAX, Math.max(SV_MIN, greens[gi].scrollSpeedUnlimited)) : 1;
			const speed = Math.min(MAX_SPEED, (bpm / this.baseBpm) * sv);

			if (i > 0) cumulative += prevSpeed * (t - prevTime);
			segments.push({
				time: t, cumulative, speed, 
			});
			prevTime = t;
			prevSpeed = speed;
		}
		return segments;
	}

	/** Scroll speed multiplier in effect at time `t`. */
	getSpeedAt(t: number): number {
		const segs = this.segments;
		if (!segs.length) return 1;
		// before the first segment: the first segment's speed is in effect
		if (t <= segs[0].time) return segs[0].speed;
		// binary search for the last segment starting at or before t
		let lo = 0;
		let hi = segs.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (segs[mid].time <= t) lo = mid;
			else hi = mid - 1;
		}
		return segs[lo].speed;
	}

	/** Cumulative scroll distance at time `t` (in base-speed-ms units). */
	positionAt(t: number): number {
		const segs = this.segments;
		// before the first segment: extrapolate with the first segment's speed
		if (t <= segs[0].time) {
			return segs[0].cumulative + segs[0].speed * (t - segs[0].time);
		}
		// binary search for the last segment starting at or before t
		let lo = 0;
		let hi = segs.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (segs[mid].time <= t) lo = mid;
			else hi = mid - 1;
		}
		const seg = segs[lo];
		return seg.cumulative + seg.speed * (t - seg.time);
	}

	/** When the scroll reaches `pos`: the inverse of {@link positionAt} (the
	 *  latest such time across a stop). */
	timeAt(pos: number): number {
		const segs = this.segments;
		if (pos < segs[0].cumulative) {
			return segs[0].time + (segs[0].speed ? (pos - segs[0].cumulative) / segs[0].speed : 0);
		}
		let lo = 0;
		let hi = segs.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (segs[mid].cumulative <= pos) lo = mid;
			else hi = mid - 1;
		}
		const seg = segs[lo];
		return seg.time + (seg.speed ? (pos - seg.cumulative) / seg.speed : 0);
	}
}

/** How close to the next red line a bar line may fall: only float error. */
const BARLINE_EPSILON = 1e-6;

/**
 * Measure barlines across the whole map: within each timing section we step by
 * one measure (beatLength * meter) from the section start to the next section.
 */
export function buildBarlines(
	beatmap: Beatmap, songEndMs: number, scroll: ScrollModel, rate = 1,
): Barline[] {
	const reds = redLinesOf(beatmap) ?? beatmap.controlPoints.timingPoints.map(tp => ({
		time: tp.startTime,
		beatLength: tp.beatLength,
		meter: tp.timeSignature,
		omitFirstBarline: beatmap.controlPoints.effectPointAt(tp.startTime).omitFirstBarLine,
	}));
	const lines: Barline[] = [];
	for (let i = 0; i < reds.length; i++) {
		const red = reds[i];
		const end = i + 1 < reds.length ? reds[i + 1].time : songEndMs * rate;
		// Clamped beat length (6 to 60000ms): gimmick maps put red lines as short
		// as 6e-96ms, a step that never advances `t` past the section start.
		const measure = Math.min(60000, Math.max(6, red.beatLength)) * Math.max(1, red.meter);
		// a section shorter than a ms keeps its line: SV maps draw art with them
		const from = red.time + (red.omitFirstBarline ? measure : 0);
		for (let t = from; t < end - BARLINE_EPSILON; t += measure) {
			lines.push({
				time: t / rate, pos: scroll.positionAt(t / rate),
			});
		}
	}
	return lines;
}

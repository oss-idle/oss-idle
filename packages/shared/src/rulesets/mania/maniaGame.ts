import type { Beatmap } from 'osu-classes';
import { ManiaRuleset } from 'osu-mania-stable';

import {
	type Mod,
	modsScoreMultiplier,
	windowScale,
} from '../../mods.js';
import { scoreMultiplier } from '../../rate.js';
import { noteSounds } from '../../sim/noteSounds.js';
import beatSnap from './beat_snap.js';
import {
	type Bot,
	type BotContext,
	type InputEvent,
} from './bot.js';
import {
	JUDGEMENT,
	type Judgement,
} from './judgement.js';
import { worstAllowed } from './mods.js';
import RuntimeNote from './runtimeNote.js';
import {
	computeHpMultiplier,
	type HitWindows,
	holdTiers,
	judge,
	judgeHold,
	maniaWindows,
	maxHpIncrease,
	ScoreState,
} from './scoring.js';
import {
	type Barline,
	buildBarlines,
	ScrollModel,
} from './scroll.js';


/** The map through the mania ruleset, so its hit objects are notes and holds
 *  with a real `column` (osu-parsers alone decodes only generic objects). */
export const toMania = (beatmap: Beatmap) => new ManiaRuleset().applyToBeatmap(beatmap);

export type ReplayOffset = {
	id: string,
	tail?: true,
	offset?: number,
};

export type ManiaGameOptions = {
	/** approach span in scroll units (mirror the renderer's SCROLL_MS) - sets
	 *  how far ahead counts as "on screen" for the bot's visibility queries */
	scrollMs?: number
	/** never end the play on HP reaching 0 (local debug play) */
	noFail?: boolean
	/** the character has the divine judgement unlocked (a rebirth grants it) */
	divine?: boolean
	/** playback rate: every time in the map runs this much faster (x1 by default) */
	rate?: number
	mods?: readonly Mod[]
	/** a match round: a fail is recorded, but the play goes on to the end */
	playOn?: boolean
	/** this map's `hpMultiplier` at this rate, from an earlier play of it: its
	 *  search runs the whole map hundreds of times */
	hpMultiplier?: number
	/** the map already through `toMania`, from an earlier play of it */
	converted?: ReturnType<typeof toMania>
};

/** One entry on the resolution timeline: a bot input judged at `time`, or - when
 *  `timedOut` - a MISS because its hit window elapsed unhit (an ignored or too-late
 *  input), ordered at that window's deadline rather than the input's own time. */
type Scheduled = { time: number; event: InputEvent; timedOut: boolean };

export type JudgementFlash = {
	judgement: Judgement
	/** song time at which it happened */
	time: number
};

export type HitRecord = {
	/** the note's time (song ms) - x axis for the deviance graph */
	time: number
	/** signed timing error in ms (negative = early, positive = late); null = miss */
	offset: number | null
	judgement: Judgement
	/** HP (0..MAX_HP) right after this judgement - the result screen's HP graph */
	hp?: number
};

/**
 * The mania gameplay engine: owns the note runtime state, the scroll model, and
 * feeds bot input events into the judgement system as the clock advances. It is
 * render-agnostic - the scene reads `notes` / `scroll` / `score` to draw.
 */
export class ManiaGame {
	readonly keyCount: number;
	readonly scroll: ScrollModel;
	readonly barlines: Barline[];
	readonly notes: RuntimeNote[];
	readonly score: ScoreState;
	readonly songStartMs: number;
	readonly songEndMs: number;
	readonly totalNotes: number;
	/** osu!mania's HP gain multiplier for this map at this rate */
	readonly hpMultiplier: number;

	/** judgement hit windows (ms) for this map's OD */
	readonly windows: HitWindows;
	/** every resolved note's signed timing error - drives the hit-error bar and
	 *  the result-screen deviance graph. A long note contributes one entry, its
	 *  *combined* head+tail error (matching the single judgement). */
	readonly hits: HitRecord[] = [];
	/** every individual landed press/release error (ms), each long note's head
	 *  press and tail release sampled *separately* - the unstable-rate population,
	 *  kept apart from `hits` (whose LN entry is the combined error). */
	readonly timings: number[] = [];

	private readonly events: InputEvent[];
	/** Every judgement (a bot input, or a timed-out miss) in the single
	 *  chronological order both client and server resolve them. Built once so the
	 *  outcome is independent of how finely the clock is stepped - the server's one
	 *  jump to the end and the client's per-frame updates produce an identical score. */
	private readonly schedule: Scheduled[];
	private schedPtr = 0;

	/** ascending input times of audible hits (note heads the bot actually presses).
	 *  Known up front, so hitsounds can be scheduled ahead on the audio clock
	 *  rather than fired reactively - which keeps them playing through tab blur and
	 *  avoids a burst when a throttled tab catches up. */
	readonly hitTimes: number[];

	/** the same audible head presses as `hitTimes`, paired with their note so the
	 *  client can play the note's keysound (or the default) at the press time. */
	readonly headHits: { time: number, note: RuntimeNote }[];

	/** scroll position of each note's head, parallel to `notes` (ascending) */
	private readonly notePositions: number[];
	/** ascending note times, for O(log N) windowed nps counts */
	private readonly noteTimes: number[];
	/** ascending note times per column, indexed by column */
	private readonly columnNoteTimes: number[][];
	private readonly visibleAhead: number;
	private readonly visibleBehind: number;

	/** last judgement, for the centre popup */
	lastFlash?: JudgementFlash;
	/** per-column song-time of the last hit, for receptor glow */
	readonly columnFlash: number[];
	/** per-column song-times the last hold was caught and let go: held while start > end */
	readonly holdStart: number[];
	readonly holdEnd: number[];

	private lastTime: number = 0;
	private readonly playOn: boolean;

	constructor(rawBeatmap: Beatmap, bot: Bot, options: ManiaGameOptions = {}) {
		const beatmap = options.converted ?? toMania(rawBeatmap);
		this.keyCount = beatmap.totalColumns;
		this.columnFlash = new Array(this.keyCount).fill(-Infinity);
		this.holdStart = new Array(this.keyCount).fill(-Infinity);
		this.holdEnd = new Array(this.keyCount).fill(-Infinity);

		const { timingPoints } = beatmap.controlPoints;
		this.notes = beatmap.hitObjects
			.filter(o => 'column' in o)
			.map(o => {
				const note = RuntimeNote.fromHitObject(
					o,
					beatSnap(o.startTime, timingPoints),
					(samples, time) => noteSounds(samples, time, beatmap.controlPoints, beatmap.general.sampleSet),
				);
				if (note.hold) note.endSnap = beatSnap(note.endTime, timingPoints);
				return note;
			});
		const rate = options.rate ?? 1;
		if (rate !== 1) for (const n of this.notes) {
			n.time /= rate;
			n.endTime /= rate;
		}

		this.totalNotes = this.notes.length;
		// one judgement per note (a long note scores once, at its tail - the head's
		// press error is folded into that combined judgement), so the score scales
		// to 1M over the note count.
		const drain = beatmap.difficulty.drainRate;
		const inc = maxHpIncrease(drain);
		this.hpMultiplier = options.hpMultiplier ?? computeHpMultiplier(
			this.notes.map(n => n.hold
				? {
					start: n.time, end: n.endTime, nested: [inc, inc], own: 0, 
				}
				: {
					start: n.time, end: n.time, nested: [], own: inc, 
				}),
			drain,
		);
		const mods = options.mods ?? [];
		this.playOn = options.playOn ?? false;
		this.score = new ScoreState(
			drain, 
			beatmap.difficulty.overallDifficulty, 
			this.notes.length,
			options.noFail || mods.includes('NF'),
			this.hpMultiplier,
			options.divine,
			scoreMultiplier(rate) * modsScoreMultiplier(mods),
			worstAllowed(mods),
		);
		this.songEndMs =
			this.notes.reduce((m, n) => Math.max(m, n.hold ? n.endTime : n.time), 0) + 2000;
		this.songStartMs =
			this.notes.reduce((m, n) => Math.min(m, n.time), Infinity) - 2000;

		this.scroll = new ScrollModel(beatmap, rate);
		this.barlines = buildBarlines(beatmap, this.songEndMs, this.scroll, rate);
		this.windows = maniaWindows(
			beatmap.difficulty.overallDifficulty, options.divine, windowScale(mods),
		);

		// visibility window (scroll units): everything between just past the
		// judgement line and the top of the approach is "on screen"
		this.visibleAhead = options.scrollMs ?? 600;
		this.visibleBehind = this.visibleAhead * 0.3;
		// note heads in scroll-distance order (monotonic with time)
		for (const n of this.notes) n.placeOn(this.scroll);
		this.notePositions = this.notes.map((n) => n.headPos);
		// ascending note times (global + per-column) for O(log N) nps counts
		this.noteTimes = this.notes.map((n) => n.time);
		this.columnNoteTimes = Array.from({ length: this.keyCount }, () => [] as number[]);
		for (const n of this.notes) this.columnNoteTimes[n.column].push(n.time);

		const context: BotContext = {
			notes: this.notes,
			inputs: [],
			keyCount: this.keyCount,
			// the windows without EZ/HR: what the bot blames is mod-independent
			windows: maniaWindows(beatmap.difficulty.overallDifficulty, options.divine),
			scroll: this.scroll,
			speedChanges: this.scroll.speedChanges,
			visibleNotes: (t) => this.visibleNotesAt(t),
			visibleRange: (t) => this.visibleRange(t),
			npsAt: (t, d, k) => this.npsAt(t, d, k),
			recentNotes: (t, d, k) => this.recentNotes(t, d, k),
			recentRange: (t, d) => this.recentRange(t, d),
		};
		this.events = bot.generateEvents(context);
		// note-head presses the bot will actually make, in ascending time order
		this.headHits = this.events.filter((e) => !e.tail && !e.ignore).map((e) => ({
			time: e.time, note: e.note, 
		}));
		this.hitTimes = this.headHits.map((h) => h.time);

		// Resolve each input at its true chronological time and merge with misses.
		// An input resolves as a MISS at its hit-window deadline when it is ignored
		// (an intentional miss, timed at `Infinity`) or lands later than the window
		// allows; otherwise it is judged at the moment it is pressed. Ordering by
		// resolution time - rather than applying every input first and bunching all
		// misses at the end - is what makes the result step-size independent, so the
		// HP curve, combo and score match between the client and the server.
		this.schedule = this.events.map((event) => this.toScheduled(event));
		this.schedule.sort((a, b) => a.time - b.time);
	}

	/** Place an input on the resolution timeline (see the schedule build above). */
	private toScheduled(event: InputEvent): Scheduled {
		const deadline = (event.tail ? event.note.endTime : event.note.time) + this.windows[JUDGEMENT.MISS];
		const timedOut = event.ignore || event.time > deadline;
		return {
			time: timedOut ? deadline : event.time, event, timedOut,
		};
	}

	/**
	 * Fold streamed replay inputs into a play already in progress. Online plays
	 * receive the server's offsets a few seconds at a time (anti-cheat: the client
	 * never knows the whole outcome up front), so events arrive after construction.
	 * Every streamed input lands ahead of the live clock, so only the unresolved
	 * tail of the schedule is re-sorted - anything already judged is untouched, and
	 * the score stays identical to the all-at-once replay.
	 */
	appendReplay(events: InputEvent[]): void {
		if (!events.length) return;
		for (const event of events) {
			this.events.push(event);
			this.schedule.push(this.toScheduled(event));
			if (!event.tail && !event.ignore) {
				this.headHits.push({
					time: event.time, note: event.note, 
				});
				this.hitTimes.push(event.time);
			}
		}
		// re-sort only the not-yet-resolved entries; consumed ones (< schedPtr) all
		// have an earlier time than any streamed input, so they never move.
		const tail = this.schedule.slice(this.schedPtr);
		tail.sort((a, b) => a.time - b.time);
		for (let i = 0; i < tail.length; i++) this.schedule[this.schedPtr + i] = tail[i];
		// hitsound lookahead reads these in ascending order (streamed heads are all
		// future, so they sort in past the already-queued ones).
		this.headHits.sort((a, b) => a.time - b.time);
		this.hitTimes.sort((a, b) => a - b);
	}

	/**
	 * The notes on screen at song time `t`, accounting for speed changes: a note
	 * is visible when its scroll distance from the judgement line falls within
	 * the approach window. Uses binary search over precomputed positions.
	 */
	visibleNotesAt(t: number): RuntimeNote[] {
		const [lo, hi] = this.visibleRange(t);
		return this.notes.slice(lo, hi);
	}

	/** `[lo, hi)` index range into `notes` of the notes visible at song time `t`. */
	visibleRange(t: number): [number, number] {
		const pos = this.scroll.positionAt(t);
		const lo = lowerBound(this.notePositions, pos - this.visibleBehind);
		const hi = lowerBound(this.notePositions, pos + this.visibleAhead);
		return [lo, hi];
	}

	/**
	 * Average notes per second at a given time in a given window
	 */
	npsAt(time: number, duration: number = 1000, column?: number): number {
		if (time < this.notePositions[0] + duration) {
			duration = Math.max(1000, time - this.notePositions[0]);
		}
		// count notes in [time - duration, time) via binary search over sorted times
		const times = column === undefined ? this.noteTimes : (this.columnNoteTimes[column] ?? EMPTY_TIMES);
		const during = lowerBound(times, time);
		const before = lowerBound(times, time - duration);
		return Math.round((during - before) / (duration / 1000) * 10) / 10;
	}

	/**
	 * The notes whose head falls in `[time - duration, time)`, ascending by time,
	 * optionally filtered to a single column. The counting counterpart of `npsAt`
	 * - use it when a skill needs the actual recent notes (e.g. their spacing)
	 * rather than just a rate.
	 */
	recentNotes(time: number, duration: number = 1000, column?: number): RuntimeNote[] {
		const [lo, hi] = this.recentRange(time, duration);
		const slice = this.notes.slice(lo, hi);
		return column === undefined ? slice : slice.filter((n) => n.column === column);
	}

	/** `[lo, hi)` index range into `notes` whose head lies in `[time - duration, time)`. */
	recentRange(time: number, duration: number = 1000): [number, number] {
		const lo = lowerBound(this.noteTimes, time - duration);
		const hi = lowerBound(this.noteTimes, time);
		return [lo, hi];
	}

	/** Advance the simulation to song time `nowMs`, resolving every judgement that
	 *  has come due in chronological order. */
	update(nowMs: number): void {
		this.lastTime = nowMs;

		while (this.schedPtr < this.schedule.length && this.schedule[this.schedPtr].time <= nowMs) {
			// the play is over the instant HP hit 0 - never resolve anything past the
			// failure point (a single jumped update must not score the rest of the map)
			if (this.score.failed && !this.playOn) break;
			const { event, timedOut } = this.schedule[this.schedPtr++];
			if (timedOut) this.applyMiss(event);
			else this.applyEvent(event);
		}
	}

	now(): number {
		return this.lastTime;
	}

	/**
	 * Move the play to song time `t`. Forward of the current position this is just
	 * `update`; seeking backward rewinds all note and score state to the start and
	 * replays up to `t`, so notes that had already been judged become un-judged
	 * (and visible) again. Used by the debug transport.
	 */
	seek(t: number): void {
		if (t < this.lastTime) this.reset();
		this.update(t);
	}

	/** Rewind every note/score/judgement back to the pre-play state. */
	private reset(): void {
		this.schedPtr = 0;
		this.lastTime = 0;
		this.hits.length = 0;
		this.timings.length = 0;
		this.lastFlash = undefined;
		this.columnFlash.fill(-Infinity);
		this.holdStart.fill(-Infinity);
		this.holdEnd.fill(-Infinity);
		this.score.reset();
		for (const n of this.notes) {
			n.headJudged = false;
			n.tailJudged = false;
			n.holding = false;
			n.tailMissedAt = undefined;
			n.headOffset = undefined;
		}
	}

	/**
	 * Per-input replay offsets (signed ms), one entry per press/release the bot
	 * produced, so an online client can reproduce the exact judgement the server
	 * computed. `offset === null` marks an ignored input (an intentional miss).
	 * Judgement is pure given `(offset, windows)`, so replaying these yields an
	 * identical score.
	 */
	replayOffsets(): ReplayOffset[] {
		return this.events.map(e => ({
			id: e.note.getId(),
			...(e.tail ? { tail: true } : {}),
			...(!e.ignore ? { offset: e.time - (e.tail ? e.note.endTime : e.note.time) } : {}),
		}));
	}

	private applyEvent(ev: InputEvent): void {
		const note = ev.note;
		if (!ev.tail) {
			if (note.headJudged) return;
			note.headJudged = true;
			const offset = ev.time - note.time; // signed: <0 early, >0 late
			if (note.hold) {
				// a hold scores once, at its tail. Its head only starts the hold and
				// records the press error (folded into the combined judgement later);
				// that press still feeds the unstable rate as its own sample.
				note.holding = !ev.ignore;
				if (note.holding) {
					this.holdStart[ev.column] = ev.time;
					note.headOffset = offset;
					this.timings.push(offset);
				}
				return;
			}
			const j = ev.ignore ? JUDGEMENT.MISS : judge(Math.abs(offset), this.windows);
			this.timings.push(offset);
			this.registerHit(j, ev.column, ev.time, note.time, offset);
		} else {
			if (note.tailJudged) return;
			note.tailJudged = true;
			if (note.holding) this.holdEnd[ev.column] = ev.time;
			note.holding = false;
			const j = this.judgeTail(note, ev);
			// a dropped hold: remember where along the body it broke, so the renderer
			// can scroll the dimmed remainder off instead of vanishing it
			if (j === JUDGEMENT.MISS) note.tailMissedAt = Math.min(Math.max(ev.time, note.time), note.endTime);
			// the release samples the unstable rate separately from the head, for any
			// hold whose head was actually caught (otherwise there is no real release)
			if (note.headOffset !== undefined) this.timings.push(ev.time - note.endTime);
			// the graph/bar dot carries the combined error mapped into its judgement's
			// band, so its position sits with its colour; a miss reads as a full miss
			this.registerHit(
				j, 
				ev.column, 
				ev.time, 
				note.endTime, 
				j === JUDGEMENT.MISS ? null : this.combinedOffset(note, ev, j),
			);
		}
	}

	/** The single osu!mania judgement for a long note, combining the press error
	 *  recorded at its head with this release. A hold misses outright when its head
	 *  was never caught, or when the key leaves the tail's window - released before
	 *  the early MEH window opens (a body drop) or after the late OK window closes
	 *  (a too-late release; late MEH is impossible). */
	private judgeTail(note: RuntimeNote, ev: InputEvent): Judgement {
		if (ev.ignore || note.headOffset === undefined) return JUDGEMENT.MISS;
		const release = ev.time - note.endTime; // signed: <0 early, >0 late
		if (release > this.windows[JUDGEMENT.GOOD] || release < -this.windows[JUDGEMENT.BAD]) 
			return JUDGEMENT.MISS;
		return judgeHold(Math.abs(note.headOffset), Math.abs(release), this.windows);
	}

	/**
	 * The signed offset to plot for a judged (non-miss) long note on the hit-error
	 * bar / deviance graph. A hold is graded on its combined error `|head| + |tail|`
	 * against windows scaled up to ~2.4× the single-tap ones, so that raw magnitude
	 * plotted on tap-window bands would land a MARVELOUS out in the GREAT/BAD zone.
	 * Instead the combined error is remapped into the tap-window band of its own
	 * judgement (so the dot sits with its colour) and signed by the larger of the
	 * two errors, so it still leans early/late toward the dominant mistake.
	 */
	private combinedOffset(note: RuntimeNote, ev: InputEvent, j: Judgement): number {
		const head = note.headOffset!;
		const release = ev.time - note.endTime;
		const dir = Math.abs(head) >= Math.abs(release) ? Math.sign(head) : Math.sign(release);
		const combined = Math.abs(head) + Math.abs(release);

		const w = this.windows;
		// each tier paired with the tap-window edge it maps onto: the combined-error
		// ceiling judgeHold grades against (from holdTiers - the shared source of
		// truth) and the matching single-tap window. BAD is the floor judgeHold omits,
		// so append it with the largest combined a non-miss hold can reach (head within
		// the miss window + an early release at the MEH edge).
		const edges = holdTiers(w)
			.map(t => ({
				judgement: t.judgement, tap: w[t.judgement], combined: t.combined, 
			}))
			.concat({
				judgement: JUDGEMENT.BAD, tap: w[JUDGEMENT.BAD], combined: w[JUDGEMENT.MISS] + w[JUDGEMENT.BAD], 
			});
		const k = edges.findIndex(e => e.judgement === j);
		const tLo = k === 0 ? 0 : edges[k - 1].tap;
		const cLo = k === 0 ? 0 : edges[k - 1].combined;
		const span = edges[k].combined - cLo;
		const frac = span > 0 ? Math.min(1, Math.max(0, (combined - cLo) / span)) : 0;
		return dir * (tLo + frac * (edges[k].tap - tLo));
	}

	/** Resolve an input that was never hit in time as a MISS (its hit window fully
	 *  elapsed). Mirrors `applyEvent` but always registers a MISS with no offset. */
	private applyMiss(ev: InputEvent): void {
		const note = ev.note;
		if (!ev.tail) {
			if (note.headJudged) return;
			note.headJudged = true;
			// a hold's single judgement is registered when its tail resolves; a
			// missed head only marks that the hold was never caught (headOffset stays
			// undefined), so the tail reads it as a MISS.
			if (!note.hold) this.registerHit(JUDGEMENT.MISS, note.column, note.time, note.time, null);
		} else {
			if (note.tailJudged) return;
			note.tailJudged = true;
			if (note.holding) this.holdEnd[note.column] = ev.time;
			note.holding = false;
			this.registerHit(JUDGEMENT.MISS, note.column, note.endTime, note.endTime, null);
		}
	}

	private registerHit(
		j: Judgement,
		column: number,
		hitTime: number,
		noteTime: number,
		offset: number | null,
	): void {
		this.score.add(j);
		this.lastFlash = {
			judgement: j, time: hitTime, 
		};
		if (j !== JUDGEMENT.MISS) this.columnFlash[column] = hitTime;
		this.hits.push({
			time: noteTime, offset, judgement: j, hp: this.score.hp,
		});
	}

	/** true once the play is over - either HP hit 0 (failed) or every note has
	 *  been fully resolved. */
	get finished(): boolean {
		return (this.score.failed && !this.playOn)
			|| (this.schedPtr >= this.schedule.length && this.allJudged());
	}

	private allJudged(): boolean {
		for (const n of this.notes) {
			if (!n.headJudged) return false;
			if (n.hold && !n.tailJudged) return false;
		}
		return true;
	}

	/** Unstable rate of this play: 10× the standard deviation over every landed
	 *  press and release, each long note's head and tail counted separately. */
	unstableRate(): number {
		return urOf(this.timings);
	}
}

/** Unstable rate: 10× the standard deviation of a set of signed offsets (ms). */
function urOf(offs: number[]): number {
	if (offs.length < 2) return 0;
	const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
	const variance = offs.reduce((a, b) => a + (b - mean) ** 2, 0) / offs.length;
	return Math.sqrt(variance) * 10;
}

/** Unstable rate over a set of hit records (their signed timing errors). Used by
 *  the per-skill strain-debug views, which judge one offset per record. */
export function unstableRate(hits: HitRecord[]): number {
	return urOf(hits.filter((h) => h.offset != null).map((h) => h.offset as number));
}

/** Shared empty array for nps queries on columns that have no notes. */
const EMPTY_TIMES: number[] = [];

/** First index in the ascending array whose value is >= `target`. */
function lowerBound(arr: number[], target: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

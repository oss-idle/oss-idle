import type { Mod } from '../../mods.js';
import type RuntimeNote from './runtimeNote.js';
import type { HitWindows } from './scoring.js';
import type {
	ScrollModel,
	SpeedChange,
} from './scroll.js';

export type InputEvent = {
	time: number,
	column: number,
	action: 'press' | 'release',
	note: RuntimeNote,
	/** release of a long-note tail */
	tail: boolean,
	ignore?: boolean,
};

/**
 * Everything the bot gets to "see" when deciding how to play. As well as the
 * note list it has the map's scroll speed changes and can ask which notes are
 * on screen at any moment (accounting for SV/BPM) - useful for density- or
 * reading-based skill.
 */
export interface BotContext {
	notes: RuntimeNote[]
	inputs: InputEvent[]
	/** number of columns (keys) in the map - used to split columns into hands */
	keyCount: number
	/** the play's mods: 7K's RT puts the middle key on the right hand */
	mods: readonly Mod[]
	/** the play's hit windows (OD, divine and mods applied) */
	windows: HitWindows
	scroll: ScrollModel
	/** every scroll speed change throughout the map (BPM sections + SVs) */
	speedChanges: SpeedChange[]
	/** the notes visible on screen at song time `t` (speed-aware) */
	visibleNotes(t: number): RuntimeNote[]
	/** `[lo, hi)` index range into `notes` of the notes visible at song time `t` -
	 *  the allocation-free form of {@link visibleNotes} for hot sliding-window skills */
	visibleRange(t: number): readonly [number, number]
	/** notes par second at song time `t` (over a window of `d` ms and optionally filtering on a column) */
	npsAt(t: number, d?: number, k?: number): number
	/** the notes whose head lies in `[t - d, t)` (window `d` ms, optionally filtering on a column) */
	recentNotes(t: number, d?: number, k?: number): RuntimeNote[]
	/** `[lo, hi)` index range into `notes` whose head lies in `[t - d, t)` - the
	 *  allocation-free form of {@link recentNotes} for hot sliding-window skills */
	recentRange(t: number, d?: number): readonly [number, number]
}

/**
 * A bot "plays" the map by emitting key press/release events with some timing
 * error. It is NOT autoplay (which would be frame-perfect): the error feeds the
 * judgement system so the result is a real, scored play. Skills are pluggable -
 * later this can be driven by the character's stats.
 */
export abstract class Bot {
	/** signed timing error (ms) applied to a note's press */
	abstract pressOffset(note: RuntimeNote, ctx: BotContext): number;
	/** signed timing error (ms) applied to a hold note's release */
	abstract releaseOffset(note: RuntimeNote, ctx: BotContext): number;

	generateEvents(ctx: BotContext): InputEvent[] {
		const events: InputEvent[] = [];
		ctx.inputs = events;
		for (const note of ctx.notes) {
			const offset = this.pressOffset(note, ctx);
			events.push({
				time: note.time + offset,
				column: note.column,
				action: 'press',
				note,
				tail: false,
				ignore: offset === Infinity || offset === -Infinity,
			});
			if (note.hold) {
				const roffset = this.releaseOffset(note, ctx);
				events.push({
					time: note.endTime + roffset,
					column: note.column,
					action: 'release',
					note,
					tail: true,
					ignore: roffset === Infinity || roffset === -Infinity,
				});
			}
		}
		events.sort((a, b) => a.time - b.time);
		return events;
	}
}

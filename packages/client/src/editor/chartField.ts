import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';

import {
	type Chart,
	type ChartDoc,
	multiplierOf,
	type Note,
	writeChart,
} from '@oss-idle/shared/rulesets/mania/editor/chart';
import type { TailOnlyNote } from '@oss-idle/shared/rulesets/mania/maniaGame';
import RuntimeNote from '@oss-idle/shared/rulesets/mania/runtimeNote';
import {
	type Barline,
	buildBarlines,
	ScrollModel,
} from '@oss-idle/shared/rulesets/mania/scroll';

import type { StageField } from '../gameplay/render/stage';

const SKIPPED = {
	parseEvents: false, parseStoryboard: false, parseColours: false,
};

const endOf = (note: Note) => note.end ?? note.time;

/** A hold the game shows as its tail alone: see `tailOnlyOf`. */
const tailOnly = (n: Note) => Number.isFinite(n.end) && !(n.time <= endOf(n));

const later = (a: Note | undefined, b: Note) => (!a || endOf(b) > endOf(a) ? b : a);

/** The scroll speed from each line on, as the game's parser leaves it: a red line resets
 *  it to 1, and a green line at the same time (the last one written) overrides that. */
const speedPoints = (doc: ChartDoc) => {
	const speeds = new Map<number, number>(doc.timing.map(red => [red.time, 1]));
	for (const green of doc.scroll) speeds.set(green.time, multiplierOf(green));
	return [...speeds]
		.sort((a, b) => a[0] - b[0])
		.map(([startTime, speed]) => ({
			startTime, scrollSpeedUnlimited: speed,
		}));
};

/** The scroll and the bar lines, as the game builds them. The parser reads only the red
 *  lines and the last note (it bounds the map's nominal BPM); green lines come as they are. */
const timeline = (chart: Chart, doc: ChartDoc, last: Note | undefined) => {
	const text = writeChart(chart, {
		...doc, scroll: [], notes: last ? [last] : [],
	});
	const beatmap = new BeatmapDecoder().decodeFromString(text, SKIPPED);
	const scroll = new ScrollModel({
		bpmUnlimited: beatmap.bpmUnlimited,
		difficulty: beatmap.difficulty,
		controlPoints: {
			timingPoints: beatmap.controlPoints.timingPoints, effectPoints: speedPoints(doc),
		},
	});
	return {
		scroll, barlines: buildBarlines(beatmap, (last ? endOf(last) : 0) + 2000, scroll),
	};
};

/**
 * A chart as the game would draw it, played perfectly: what the editor's preview
 * shows. Built straight from the editor's notes, so an edit costs no parse.
 */
export default class ChartField implements StageField {

	readonly keyCount: number;
	readonly notes: RuntimeNote[];
	readonly tailOnly: TailOnlyNote[];
	readonly scroll: ScrollModel;
	readonly barlines: Barline[];
	readonly columnFlash: number[];
	readonly holdStart: number[];
	readonly holdEnd: number[];
	readonly songStartMs: number;

	/** `reuse`: the previous field, whose scroll still holds when only notes moved. */
	constructor(chart: Chart, doc: ChartDoc, reuse?: ChartField) {
		this.keyCount = chart.keys;
		this.columnFlash = new Array(chart.keys).fill(-Infinity);
		this.holdStart = new Array(chart.keys).fill(-Infinity);
		this.holdEnd = new Array(chart.keys).fill(-Infinity);
		// a hold starting at NaN or ending before it starts shows only its tail, as the game draws
		// it; any other NaN note, not at all
		const played = doc.notes.filter(n => !Number.isNaN(n.time) && !tailOnly(n));
		this.notes = played
			.sort((a, b) => a.time - b.time || a.column - b.column)
			.map(n => new RuntimeNote(n.time, endOf(n), n.column, n.end !== undefined, false, false, false));
		const last = played.reduce<Note | undefined>(later, undefined);
		const key = {
			timing: doc.timing, scroll: doc.scroll, end: last && endOf(last),
		};
		const same = reuse && reuse.key.timing === key.timing && reuse.key.scroll === key.scroll
			&& reuse.key.end === key.end;
		({ scroll: this.scroll, barlines: this.barlines } = same ? reuse : timeline(chart, doc, last));
		this.key = key;
		this.songStartMs = this.notes[0]?.time ?? 0;
		for (const note of this.notes) note.placeOn(this.scroll);
		this.tailOnly = doc.notes
			.flatMap(n => (tailOnly(n) ? [{
				column: n.column, time: endOf(n), 
			}] : []))
			.map(t => ({
				...t, pos: this.scroll.positionAt(t.time), 
			}))
			.sort((a, b) => a.time - b.time);
	}

	private readonly key: { timing: object, scroll: object, end?: number };

	/** Every note at `now` as autoplay leaves it: heads pressed on time, holds released on time. */
	seek(now: number): void {
		this.columnFlash.fill(-Infinity);
		this.holdStart.fill(-Infinity);
		this.holdEnd.fill(-Infinity);
		const notes = this.notes;
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			note.headJudged = note.time <= now;
			note.holding = note.hold && note.headJudged && note.endTime > now;
			note.tailJudged = note.hold && note.endTime <= now;
			if (!note.headJudged) continue;
			if (!note.hold) this.columnFlash[note.column] = note.time;
			else {
				this.holdStart[note.column] = note.time;
				if (note.tailJudged) this.columnFlash[note.column] = this.holdEnd[note.column] = note.endTime;
			}
		}
	}

	visibleNotesAt(): RuntimeNote[] {
		return this.notes;
	}

}

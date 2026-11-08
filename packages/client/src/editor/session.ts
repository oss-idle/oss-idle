import Synced from '@oss-idle/shared/helpers/synced';
import { RATE_STEP } from '@oss-idle/shared/rate';
import {
	type Chart,
	type ChartDoc,
	DIVISORS,
	inEffect,
	MAX_DIVISOR,
	type Metadata,
	type Note,
	parseChart,
	snapAt,
	snapTime,
	stepTime,
	stepToward,
	type TimingPoint,
	withBackground,
	withFileIds,
	withOmitFirstBarLine,
	withoutBeatmapId,
	writeChart,
} from '@oss-idle/shared/rulesets/mania/editor/chart';
import {
	checkChart,
	type Issue,
} from '@oss-idle/shared/rulesets/mania/editor/checks';
import {
	fitting,
	flipped,
	fullHolds,
	inverted,
	notesIn,
	overlaps,
	resnapped,
	reversed,
	shifted,
	swappedLanes,
	withoutHolds,
} from '@oss-idle/shared/rulesets/mania/editor/edits';
import {
	extrasFile,
	withExtras,
	writeExtras,
} from '@oss-idle/shared/rulesets/mania/editor/extras';
import {
	type Addition,
	hasAddition,
	type NoteSample,
	parsePointSound,
	type PointSound,
	soundPointAt,
	withAddition,
	withSample,
	writePointSound,
} from '@oss-idle/shared/rulesets/mania/editor/hitsounds';

import { effects } from '../audio/EffectPlayer';
import { music } from '../audio/MusicPlayer';
import { Setting } from '../db/settings';
import {
	entryById,
	library,
	onLibraryChanged,
	readEntryFile,
} from '../library';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import type LightBeatmap from '../osu/beatmap/LightBeatmap';
import { assetKey } from '../osu/beatmap/storyboard';
import EditorSounds from './editorSounds';
import type { HoveredPoint } from './painter';
import { currentPlacing } from './placing';
import type { PlayfieldClock } from './playfieldMessages';
import {
	addSampleFiles,
	changeSetFiles,
	localCopyOf,
	removeSetFile,
	saveChart,
	setBackgroundImage,
	writeIds,
} from './save';
import {
	constantScroll,
	linearScroll,
	type Range,
	scaleScroll,
} from './svTools';
import type { UploadIds } from './upload';

// an edit snapshots the whole document (shared note objects); fine for
// a few thousand notes, switch to per-action diffs if charts get much bigger
const HISTORY = 200;

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 2;
/** pixels per ms */
const zoom = new Setting('editor.zoom', 0.3);

/** A track's channels mixed down to one. */
const monoOf = (buffer: AudioBuffer | undefined) => {
	if (!buffer) return undefined;
	const pcm = new Float32Array(buffer.length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const channel = buffer.getChannelData(c);
		for (let i = 0; i < pcm.length; i++) pcm[i] += channel[i] / buffer.numberOfChannels;
	}
	return {
		pcm, rate: buffer.sampleRate, 
	};
};

/** The extra beat lines a step takes while the song plays (Quaver's 3). */
const PLAYING_STEPS = 3;

/** The playback speeds the editor steps through: song select's steps, from 0.25 to 2. */
const SPEEDS = Array.from({ length: 36 }, (_, i) => Math.round((0.25 + i * RATE_STEP) * 100) / 100);

/** What a left click on the field does: pick notes, place notes, or place notes and long notes. */
export const TOOLS = ['select', 'note', 'hold'] as const;
export type EditorTool = typeof TOOLS[number];
const tool = new Setting<EditorTool>('editor.tool', 'hold');

/** Bumped per open: the gameplay track belongs to the newest session only. */
let opens = 0;

/** Copied notes, kept across sessions so they paste into another difficulty. */
let clipboard: Note[] = [];

/** The snaps a paste lands on, as Quaver's. */
const PASTE_SNAPS = [16, 12];

export { MAX_DIVISOR };

/** Whole-map changes, like Quaver's modifiers. */
export const MODIFIERS = ['mirror', 'noHolds', 'fullHolds', 'inverse'] as const;
export type Modifier = typeof MODIFIERS[number];

const docOf = (chart: Chart): ChartDoc => ({
	notes: chart.notes, timing: chart.timing, scroll: chart.scroll, metadata: chart.metadata,
	bookmarks: chart.bookmarks,
});

const chartOf = async (beatmap: LightBeatmap): Promise<Chart> => {
	const setId = beatmap.set.metadata.id;
	const text = await BeatmapStore.getOsu(setId, beatmap.metadata.id);
	if (text === undefined) throw new Error(`no chart for ${beatmap.metadata.id}`);
	const file = beatmap.metadata.file;
	const extras = file && await BeatmapStore.getFileText(setId, extrasFile(file));
	return withExtras(parseChart(text), extras);
};

/**
 * One difficulty open in the editor: its notes, timing points and metadata with
 * undo/redo, the view settings, and the song clock. The canvas reads it every
 * frame; React views re-render on `revision`.
 */
export default class EditorSession {

	public readonly revision = new Synced(0);
	/** The BPM or SV point the pointer is on in its list, lit on the field and the timeline. */
	public readonly hoveredPoint = new Synced<HoveredPoint | undefined>(undefined);

	private doc: ChartDoc;
	public selected = new Set<Note>();

	/** The notes show what they play (the hitsounds tab is open). */
	public showSounds = false;

	public setShowSounds(on: boolean): void {
		this.showSounds = on;
		this.changed();
	}
	public divisor = 4;
	/** The snaps offered, the custom ones added in order. */
	public divisors = [...DIVISORS];

	private past: ChartDoc[] = [];
	private future: ChartDoc[] = [];
	private saved: ChartDoc;
	private pausedAt = 0;
	private playing = false;

	private constructor(
		public beatmap: LightBeatmap,
		public chart: Chart,
		private audio: boolean,
		private opened: number,
	) {
		this.doc = docOf(chart);
		this.saved = this.doc;
	}

	/** The set's id, where its sample files are stored. */
	public get setId(): number {
		return this.beatmap.set.metadata.id;
	}

	/** The metronome and the notes' hitsounds, on the audio clock while the song plays. */
	private readonly sounds = new EditorSounds(this);

	public get notes(): Note[] {
		return this.doc.notes;
	}

	public get timing(): TimingPoint[] {
		return this.doc.timing;
	}

	public get scroll(): TimingPoint[] {
		return this.doc.scroll;
	}

	public get metadata(): Metadata {
		return this.doc.metadata;
	}

	public get bookmarks(): number[] {
		return this.doc.bookmarks;
	}

	/** The chart as it stands; a new object with every edit, undo and redo. */
	public get snapshot(): Readonly<ChartDoc> {
		return this.doc;
	}

	/** The .osu text as it stands, saved or not. */
	public text(): string {
		return writeChart(this.chart, this.doc);
	}

	public static async open(asked: LightBeatmap): Promise<EditorSession> {
		const beatmap = await localCopyOf(asked) ?? asked;
		const chart = await chartOf(beatmap);
		const opened = ++opens;
		music.pause();
		const audio = await music.prepareGameplay(beatmap);
		const session = new EditorSession(beatmap, chart, audio, opened);
		session.song = monoOf(music.gameplayAudio());
		session.songMs = music.gameDuration();
		return session;
	}

	/** The song as mono samples at normal speed, for its waveform and spectrogram. */
	public song?: { pcm: Float32Array, rate: number };
	/** The song's length in song ms, kept while a new speed's track is being made */
	private songMs = 0;

	/** Whether `other` is in this set and plays the same track. */
	public sameTrack(other: LightBeatmap): boolean {
		return other.set.metadata.id === this.beatmap.set.metadata.id
			&& other.metadata.audio === this.beatmap.metadata.audio;
	}

	/** Another difficulty of the set drawn beside the field, dimmed and read-only. */
	public reference?: { beatmap: LightBeatmap, doc: ChartDoc };

	/** The set's other difficulties, to pick a reference from. */
	public get otherDifficulties(): LightBeatmap[] {
		return this.beatmap.set.beatmaps.filter(beatmap => !beatmap.is(this.beatmap));
	}

	public async setReference(beatmap?: LightBeatmap): Promise<void> {
		this.reference = beatmap && {
			beatmap, doc: docOf(await chartOf(beatmap)),
		};
		this.changed();
	}

	/** The reference on (the first other difficulty, or the last one shown) or off. */
	public toggleReference(): void {
		const [first] = this.otherDifficulties;
		if (this.reference) {
			this.lastReference = this.reference.beatmap;
			void this.setReference(undefined);
		} else if (first) {
			void this.setReference(this.otherDifficulties.find(b => b === this.lastReference) ?? first);
		}
	}

	private lastReference?: LightBeatmap;

	/** Edit another difficulty on the same track: the clock and the view carry on. */
	public async switchTo(other: LightBeatmap): Promise<void> {
		this.switches++;
		this.reference = undefined;
		this.chart = await chartOf(other);
		this.beatmap = other;
		this.doc = docOf(this.chart);
		this.saved = this.doc;
		this.past = [];
		this.future = [];
		this.selected = new Set();
		this.changed();
	}

	/** bumped by every switch to another difficulty, for a store write finishing after one */
	private switches = 0;

	/** A store write's answer, `stored` (this difficulty as stored now), taken as the session's
	 *  - unless it switched to another difficulty meanwhile; returns whether it was taken. */
	private took(stored: LightBeatmap, switches: number): boolean {
		if (switches !== this.switches) return false;
		this.beatmap = stored;
		return true;
	}

	private reopened?: Promise<void>;

	/** Take the track back, after a test play had it; calls share one load. */
	public reopen(): Promise<void> {
		return this.reopened ??= (async () => {
			this.opened = ++opens;
			music.pause();
			this.audio = await music.prepareGameplay(this.beatmap, this.rate, !this.keepPitch, true);
			this.songMs = music.gameDuration() * this.rate;
			if (this.folderWatched) void this.openFolder(false);
			this.changed();
		})();
	}

	/** Stop the track, unless a newer session has it already. */
	public dispose(): void {
		this.closeFolder?.();
		// a test play: watched again on coming back, without opening the explorer again
		this.folderWatched = this.closeFolder !== undefined;
		this.closeFolder = undefined;
		this.sounds.stop();
		this.reopened = undefined;
		// a track still being made must not start playing once the editor is gone
		this.playing = false;
		this.speedChanges++;
		if (this.opened === opens) {
			music.stopGameplay();
			music.releaseLiveStretch();
		}
	}

	private changed(): void {
		void this.revision.set(this.revision.get() + 1);
	}

	public get dirty(): boolean {
		return this.doc !== this.saved;
	}

	public get canUndo(): boolean {
		return this.past.length > 0;
	}

	public get canRedo(): boolean {
		return this.future.length > 0;
	}

	// ---- edits ----

	/** Make `doc` the chart, with `selected` (a subset of its notes) selected. */
	private commit(doc: ChartDoc, selected: Note[] = []): void {
		this.past = [...this.past, this.doc].slice(-HISTORY);
		this.future = [];
		this.doc = doc;
		this.selected = new Set(selected);
		this.changed();
	}

	/** Change any part of the chart in one undoable step (the add-on API's edit). */
	public editDoc(change: Partial<ChartDoc>, selected: Note[] = []): void {
		const notes = change.notes ?? this.notes;
		this.commit({
			...this.doc,
			...change,
			timing: [...change.timing ?? this.timing].sort((a, b) => a.time - b.time),
			scroll: [...change.scroll ?? this.scroll].sort((a, b) => a.time - b.time),
			bookmarks: [...change.bookmarks ?? this.bookmarks].sort((a, b) => a - b),
		}, selected.filter(note => notes.includes(note)));
	}

	private apply(notes: Note[], selected: Note[] = []): void {
		this.commit({
			...this.doc, notes, 
		}, selected);
	}

	public undo(): void {
		const previous = this.past[this.past.length - 1];
		if (!previous) return;
		this.past = this.past.slice(0, -1);
		this.future = [this.doc, ...this.future];
		this.doc = previous;
		this.selected = new Set();
		this.changed();
	}

	public redo(): void {
		const [next, ...rest] = this.future;
		if (!next) return;
		this.future = rest;
		this.past = [...this.past, this.doc];
		this.doc = next;
		this.selected = new Set();
		this.changed();
	}

	/** Add a note (a long note with `end`) unless it would overlap another. */
	public place(time: number, column: number, end?: number): void {
		const note: Note = {
			time, column, end, hitSound: '0', sample: '0:0:0:0:',
		};
		if (this.notes.some(other => overlaps(note, other))) return;
		this.apply([...this.notes, note]);
	}

	public remove(note: Note): void {
		this.apply(
			this.notes.filter(other => other !== note),
			this.selection.filter(other => other !== note),
		);
	}

	/** Give a long note a new end: refused when it leaves the note no length or runs into
	 *  the next note in its column. The note stays selected. */
	public resizeHold(note: Note, end: number): void {
		if (note.end === undefined || end <= note.time || end === note.end) return;
		const resized = {
			...note, end, 
		};
		if (this.notes.some(other => other !== note && overlaps(resized, other))) return;
		this.apply(this.notes.map(other => (other === note ? resized : other)), [resized]);
	}

	/** The long note whose end is at `time` in `column`, give or take `tolerance` ms. */
	public tailAt(time: number, column: number, tolerance: number): Note | undefined {
		return this.notes.find(note => note.column === column
			&& note.end !== undefined && Math.abs(time - note.end) <= tolerance);
	}

	/** The note covering `time` in `column`, give or take `tolerance` ms. */
	public noteAt(time: number, column: number, tolerance: number): Note | undefined {
		return this.notes.find(note => note.column === column
			&& time >= note.time - tolerance && time <= (note.end ?? note.time) + tolerance);
	}

	/** Where a live note lands: the current ms, snapped (after the offset) only while
	 *  playing with live snapping on, as Quaver's. */
	private liveTime(): number {
		const time = Math.round(this.now());
		const { liveSnap, liveOffset } = currentPlacing();
		return liveSnap && this.playing ? this.snap(time + liveOffset) : time;
	}

	/** The live notes whose keys are down, by column. */
	private held = new Map<number, Note>();

	/** A column's live mapping key down: the note starting at the current time there goes, or
	 *  a note is placed, over any long note it lands in. */
	public liveDown(column: number): void {
		if (column >= this.chart.keys) return;
		const time = this.liveTime();
		const existing = this.notes.find(note => note.column === column && Math.abs(note.time - time) < 1);
		if (existing) return this.remove(existing);
		const note: Note = {
			time, column, hitSound: '0', sample: '0:0:0:0:',
		};
		this.apply([...this.notes.filter(other => !overlaps(note, other)), note]);
		this.held.set(column, note);
	}

	/** A column's key up: held past the minimum, its note becomes a long note to now. */
	public liveUp(column: number): void {
		const note = this.held.get(column);
		this.held.delete(column);
		const { liveHolds, liveHoldMin } = currentPlacing();
		if (!note || !liveHolds || !this.notes.includes(note)) return;
		const end = this.liveTime();
		if (end - note.time <= liveHoldMin) return;
		const hold = {
			...note, end,
		};
		this.apply([...this.notes.filter(other => other !== note && !overlaps(hold, other)), hold]);
	}

	// ---- selection ----

	/** The selected notes, in chart order. */
	public get selection(): Note[] {
		return this.notes.filter(note => this.selected.has(note));
	}

	public select(notes: Note[], add = false): void {
		this.selected = new Set(add ? [...this.selected, ...notes] : notes);
		this.changed();
	}

	public toggleSelected(note: Note): void {
		const selected = new Set(this.selected);
		if (!selected.delete(note)) selected.add(note);
		this.selected = selected;
		this.changed();
	}

	public selectAll(): void {
		this.select(this.notes);
	}

	/** Add the notes starting at the current time, give or take 2 ms. */
	public selectAtNow(): void {
		const now = this.now();
		this.select(this.notes.filter(note => Math.abs(note.time - now) < 2), true);
	}

	public clearSelection(): void {
		this.select([]);
	}

	/** Select the notes in a box of song time and columns. */
	public selectBox(from: number, to: number, first: number, last: number, add: boolean): void {
		this.select(notesIn(this.notes, from, to, first, last), add);
	}

	private get unselected(): Note[] {
		return this.notes.filter(note => !this.selected.has(note));
	}

	/** Swap the selection for `moved`, unless that leaves the field or overlaps a note. */
	private replaceSelection(moved: Note[]): boolean {
		const outside = moved.some(note => note.time < 0
			|| note.column < 0 || note.column >= this.chart.keys);
		if (!moved.length || outside || fitting(moved, this.unselected).length < moved.length) {
			return false;
		}
		this.apply([...this.unselected, ...moved], moved);
		return true;
	}

	public deleteSelection(): void {
		if (this.selected.size) this.apply(this.unselected);
	}

	/** Move the selection by `dt` ms and `dc` columns, then onto the beat lines unless
	 *  `keepOffset`. */
	public moveSelection(dt: number, dc: number, keepOffset = true): boolean {
		return this.replaceSelection(this.shiftedSelection(dt, dc, keepOffset));
	}

	public shiftedSelection(dt: number, dc: number, keepOffset: boolean): Note[] {
		const moved = shifted(this.selection, dt, this.columnShift(dc));
		return keepOffset ? moved : this.onLines(moved);
	}

	/** Heads and tails on their nearest beat line; a long note that collapses becomes a note. */
	private onLines(notes: Note[]): Note[] {
		const line = (time: number) => snapTime(this.timing, time, snapAt(this.timing, time, this.divisor));
		return notes.map(note => {
			const time = line(note.time);
			const end = note.end === undefined ? undefined : line(note.end);
			return {
				...note, time, end: end !== undefined && end > time ? end : undefined,
			};
		});
	}

	/** `dc` held to what keeps every selected note inside the columns. */
	public columnShift(dc: number): number {
		let first = this.chart.keys;
		let last = -1;
		for (const note of this.selection) {
			first = Math.min(first, note.column);
			last = Math.max(last, note.column);
		}
		return last < 0 ? dc : Math.min(this.chart.keys - 1 - last, Math.max(-first, dc));
	}

	/** Move the selection to the next (1) or previous (-1) beat line. */
	public nudgeSelection(direction: 1 | -1): void {
		const [first] = this.selection;
		if (!first) return;
		const to = stepTime(this.timing, first.time, this.lineDivisor(first.time, direction), direction);
		this.moveSelection(to - first.time, 0);
	}

	public flipSelection(): void {
		this.replaceSelection(flipped(this.selection, this.chart.keys));
	}

	/** Snap the selection, or the whole chart when nothing is selected, to the nearest
	 *  line of `divisors` (the beat snap's by default). A note that lands on another is
	 *  dropped. Returns how many notes moved. */
	public resnap(divisors = [this.divisor]): number {
		const all = !this.selected.size;
		const rest = all ? [] : this.unselected;
		const targets = all ? this.notes : this.selection;
		const moved = fitting(resnapped(targets, this.timing, divisors), rest);
		const count = moved.filter((note, i) => note.time !== targets[i]?.time
			|| note.end !== targets[i]?.end).length;
		this.apply([...rest, ...moved], all ? [] : moved);
		return count;
	}

	/** Play the selection backwards over its own span. */
	public reverseSelection(): void {
		this.replaceSelection(reversed(this.selection));
	}

	/** Columns `a` and `b` of the selection swapped. */
	public swapLanes(a: number, b: number): void {
		if (a === b || Math.max(a, b) >= this.chart.keys || Math.min(a, b) < 0) return;
		this.replaceSelection(swappedLanes(this.selection, a, b));
	}

	private swapFrom?: number;

	/** Alt + a column's key, twice: the two columns of the selection swap (Quaver's). */
	public pickSwapLane(column: number): void {
		if (this.swapFrom === undefined) {
			this.swapFrom = column;
			return;
		}
		this.swapLanes(this.swapFrom, column);
		this.swapFrom = undefined;
	}

	/** Change the whole chart: mirrored, long notes made notes, every note held to the
	 *  next, or gaps and long notes swapped (Quaver's modifiers; this one undoes). */
	public applyModifier(modifier: Modifier): void {
		const { keys } = this.chart;
		this.apply({
			mirror: () => flipped(this.notes, keys),
			noHolds: () => withoutHolds(this.notes),
			fullHolds: () => fullHolds(this.notes, this.timing, keys),
			inverse: () => inverted(this.notes, this.timing, keys),
		}[modifier]());
	}

	/** Move everything timed (notes, BPM and SV points, the preview point, bookmarks) by `ms`. */
	public offsetMap(ms: number): void {
		if (!ms) return;
		const moved = (points: TimingPoint[]) => points.map(point => ({
			...point, time: point.time + ms,
		}));
		const { previewTime } = this.metadata;
		this.commit({
			notes: shifted(this.notes, ms, 0),
			timing: moved(this.timing),
			scroll: moved(this.scroll),
			metadata: {
				...this.metadata, previewTime: previewTime >= 0 ? previewTime + ms : previewTime,
			},
			bookmarks: this.bookmarks.map(time => time + ms),
		});
	}

	public copy(): void {
		if (this.selected.size) clipboard = [...this.selection].sort((a, b) => a.time - b.time);
	}

	public cut(): void {
		this.copy();
		this.deleteSelection();
	}

	/** Paste the copied notes from the current time, resnapped to 1/16 and 1/12 or as
	 *  they were copied, all of them even where they overlap. */
	public paste(resnap = true): void {
		const [first] = clipboard;
		if (!first) return;
		const placed = shifted(clipboard, Math.round(this.now()) - first.time, 0)
			.filter(note => note.column < this.chart.keys);
		const pasted = resnap ? resnapped(placed, this.timing, PASTE_SNAPS) : placed;
		if (pasted.length) this.apply([...this.notes, ...pasted], pasted);
	}

	// ---- timing and metadata ----

	private setTiming(timing: TimingPoint[]): void {
		this.commit({
			...this.doc, timing: [...timing].sort((a, b) => a.time - b.time), 
		});
	}

	/** A BPM point at the current time, carrying on from the one before it. */
	/** A BPM point at the current time, like the one before it; returns its time. */
	public addTimingPoint(): number {
		const time = Math.round(this.now());
		if (this.timing.some(point => point.time === time)) return time;
		const before = inEffect(this.timing, time) ?? this.timing[0];
		this.setTiming([...this.timing, {
			time,
			beatLength: before?.beatLength ?? 500,
			meter: before?.meter ?? 4,
			sound: before?.sound ?? '0,0,100',
			effects: '0',
		}]);
		return time;
	}

	/** A BPM point at `time` with `beatLength`, or the one there changed to it. */
	public setTempoAt(time: number, beatLength: number): void {
		const at = Math.round(time);
		const there = this.timing.find(point => point.time === at);
		if (there) return this.updateTimingPoint(there, { beatLength });
		const before = inEffect(this.timing, at) ?? this.timing[0];
		this.setTiming([...this.timing, {
			time: at,
			beatLength,
			meter: before?.meter ?? 4,
			sound: before?.sound ?? '0,0,100',
			effects: '0',
		}]);
	}

	/** The BPM point in effect at the current time given `beatLength`, or one added at
	 *  `time` when there is none. */
	public setTempo(time: number, beatLength: number): void {
		const point = inEffect(this.timing, this.now()) ?? this.timing[0];
		if (point) this.updateTimingPoint(point, { beatLength });
		else this.setTempoAt(time, beatLength);
	}

	public updateTimingPoint(point: TimingPoint, change: Partial<TimingPoint>): void {
		this.setTiming(this.timing.map(other => (other === point ? {
			...point, ...change, 
		} : other)));
	}

	public setOmitFirstBarLine(point: TimingPoint, omit: boolean): void {
		this.setTiming(this.timing.map(other => (other === point
			? withOmitFirstBarLine(point, omit) : other)));
	}

	public removeTimingPoint(point: TimingPoint): void {
		void this.hoveredPoint.set(undefined);
		this.setTiming(this.timing.filter(other => other !== point));
	}

	private setScroll(scroll: TimingPoint[]): void {
		this.commit({
			...this.doc, scroll: [...scroll].sort((a, b) => a.time - b.time), 
		});
	}

	/** The scroll speed point in effect at `time`, if any. */
	public scrollAt(time: number): TimingPoint | undefined {
		return inEffect(this.scroll, time);
	}

	/** An SV point at the current time, carrying on the speed in effect there. */
	/** An SV point at the current time, like the one before it; returns its time. */
	public addScrollPoint(): number {
		const time = Math.round(this.now());
		if (this.scroll.some(point => point.time === time)) return time;
		const before = this.scrollAt(time);
		this.setScroll([...this.scroll, {
			time,
			beatLength: before?.beatLength ?? -100,
			meter: before?.meter ?? 4,
			sound: before?.sound ?? '0,0,100',
			effects: '0',
		}]);
		return time;
	}

	public updateScrollPoint(point: TimingPoint, change: Partial<TimingPoint>): void {
		this.setScroll(this.scroll.map(other => (other === point ? {
			...point, ...change, 
		} : other)));
	}

	public removeScrollPoint(point: TimingPoint): void {
		void this.hoveredPoint.set(undefined);
		this.setScroll(this.scroll.filter(other => other !== point));
	}

	// ---- hitsounds ----

	/** Swap each of `targets` for what `change` makes of it, keeping them selected. */
	private replaceNotes(targets: Note[], change: (note: Note) => Note): void {
		if (!targets.length) return;
		const changed = new Map(targets.map(note => [note, change(note)]));
		this.apply(this.notes.map(note => changed.get(note) ?? note), [...changed.values()]);
	}

	/** An addition on the selected notes: on, unless every one of them has it already. */
	public toggleAddition(addition: Addition): void {
		const on = !this.selection.every(note => hasAddition(note, addition));
		this.replaceNotes(this.selection, note => withAddition(note, addition, on));
	}

	/** Set some of the selected notes' sample fields (sets, index, volume, file). */
	public patchSample(patch: Partial<NoteSample>): void {
		this.replaceNotes(this.selection, note => withSample(note, patch));
	}

	/** Make `image` the set's background, on every difficulty or only this one. */
	public async setBackground(image: File, onlyThis = false): Promise<void> {
		const switches = this.switches;
		const { beatmap, name } = await setBackgroundImage(this.beatmap, image, onlyThis);
		if (!this.took(beatmap, switches)) return;
		this.chart = {
			...this.chart, text: withBackground(this.chart.text, name), background: true,
		};
		this.changed();
	}

	/** Add sample files to the set, for notes to play as their own. */
	public async addSamples(files: File[]): Promise<void> {
		const switches = this.switches;
		this.took(await addSampleFiles(this.beatmap, files), switches);
		this.soundFilesChanged(files.map(file => file.name));
	}

	/** stops following the set's folder, when one is followed */
	private closeFolder?: () => void;
	/** the folder followed */
	private folder?: string;
	/** the folder was followed when the editor left for a test play */
	private folderWatched = false;

	/** The set's folder in the file explorer (desktop): sounds, images and the rest
	 *  changed there come into the map while the editor is open; its .osu files stay the
	 *  editor's. */
	public async openFolder(show = true): Promise<void> {
		if (!library()) return;
		this.closeFolder?.();
		const folder = (await entryById('maps', this.beatmap.set.metadata.id))?.name;
		if (!folder) return;
		this.folder = folder;
		this.closeFolder = onLibraryChanged('maps', change => {
			if (change.name === folder) void this.takeFolderFiles(folder, change.changed);
		});
		if (show) await library()!.reveal('maps', folder);
	}

	private async takeFolderFiles(folder: string, changed: string[]): Promise<void> {
		const names = changed.filter(name => !/\.(osu|oss)$/i.test(name));
		if (!names.length) return;
		const files: Record<string, Uint8Array | undefined> = {};
		for (const name of names) {
			const blob = await readEntryFile('maps', folder, name);
			files[name] = blob && new Uint8Array(await blob.arrayBuffer());
		}
		const switches = this.switches;
		this.took(await changeSetFiles(this.beatmap, files), switches);
		this.soundFilesChanged(names);
	}

	/** Follow the set's own folder once edits moved the map to its local copy. */
	private async followFolder(): Promise<void> {
		if (!this.closeFolder) return;
		const now = (await entryById('maps', this.beatmap.set.metadata.id))?.name;
		if (now && now !== this.folder) await this.openFolder(false);
	}

	/** The sound file `name` with new audio: the notes playing it play the new one. */
	public async replaceSample(name: string, file: File): Promise<void> {
		const switches = this.switches;
		const renamed = new File([file], name, { type: file.type });
		this.took(await addSampleFiles(this.beatmap, [renamed]), switches);
		this.soundFilesChanged([name]);
	}

	/** Take the sound file `name` out of the set: notes playing it fall back to the default sounds. */
	public async removeSample(name: string): Promise<void> {
		const switches = this.switches;
		this.took(await removeSetFile(this.beatmap, name), switches);
		this.soundFilesChanged([name]);
	}

	/** Hear the map's sound file `name`. */
	public async playSample(name: string): Promise<void> {
		const setId = this.beatmap.set.metadata.id;
		const key = assetKey(setId, name);
		const url = !effects.isLoaded(key) && await BeatmapStore.getSampleUrl(setId, name);
		if (url) {
			await effects.load(key, url);
			URL.revokeObjectURL(url);
		}
		effects.play(key);
	}

	private soundFilesChanged(names: string[]): void {
		for (const name of names) effects.forget(assetKey(this.beatmap.set.metadata.id, name));
		this.sounds.reload();
		this.changed();
		void this.followFolder();
		const song = this.chart.audio.toLowerCase();
		if (names.some(name => name.toLowerCase() === song)) void this.reloadSong();
	}

	/** The song's file changed: decoded again, its waveform with it. */
	private async reloadSong(): Promise<void> {
		const playing = this.playing;
		const change = this.speedChanges;
		this.pause();
		music.forgetTrack();
		const audio = await music.prepareGameplay(this.beatmap, this.rate, !this.keepPitch, true);
		if (change !== this.speedChanges) return;
		this.audio = audio;
		this.songMs = music.gameDuration() * this.rate;
		this.song = monoOf(music.gameplayAudio());
		if (playing) this.play();
		this.changed();
	}

	// ---- bookmarks ----

	private setBookmarks(bookmarks: number[]): void {
		this.commit({
			...this.doc, bookmarks: [...bookmarks].sort((a, b) => a - b),
		}, this.selection);
	}

	/** A bookmark at the current time, or the one there taken away. */
	public toggleBookmark(): void {
		const time = Math.round(this.now());
		const there = this.bookmarks.filter(other => Math.abs(other - time) < 1);
		this.setBookmarks(there.length
			? this.bookmarks.filter(other => !there.includes(other))
			: [...this.bookmarks, time]);
	}

	public removeBookmark(time: number): void {
		this.setBookmarks(this.bookmarks.filter(other => other !== time));
	}

	/** The next bookmark after the current time (1) or the one before it (-1), as Quaver's. */
	public seekBookmark(direction: 1 | -1): void {
		const now = this.now();
		const next = direction > 0
			? this.bookmarks.find(time => time > now + 0.1)
			: [...this.bookmarks].reverse().find(time => time < now - 0.1);
		if (next !== undefined) this.seek(next);
	}

	/** The point (BPM or SV) whose sample defaults the notes at the current time take. */
	public get soundPoint(): TimingPoint | undefined {
		return soundPointAt(this.timing, this.scroll, this.now());
	}

	/** Change that point's sample defaults. */
	public setPointSound(patch: Partial<PointSound>): void {
		const point = this.soundPoint;
		if (!point) return;
		const changed = {
			...point, sound: writePointSound({
				...parsePointSound(point.sound), ...patch,
			}), 
		};
		const swap = (points: TimingPoint[]) => points.map(other => (other === point ? changed : other));
		this.commit({
			...this.doc, timing: swap(this.timing), scroll: swap(this.scroll),
		}, this.selection);
	}

	/** The SV tools' range: from the first selected note to the end of the last one. */
	public get scrollRange(): Range | undefined {
		const selection = this.selection;
		if (!selection.length) return undefined;
		const from = Math.min(...selection.map(note => note.time));
		const to = Math.max(...selection.map(note => note.end ?? note.time));
		return to > from ? {
			from, to, 
		} : undefined;
	}

	/** Swap the SV points for what `make` builds over the range, keeping the notes selected. */
	private rescroll(make: (range: Range) => TimingPoint[]): void {
		const range = this.scrollRange;
		if (range) this.commit({
			...this.doc, scroll: make(range), 
		}, this.selection);
	}

	public linearScroll(start: number, end: number): void {
		this.rescroll(range => linearScroll(this.scroll, this.timing, this.divisor, range, start, end));
	}

	public constantScroll(speed: number): void {
		this.rescroll(range => constantScroll(this.scroll, range, speed));
	}

	public scaleScroll(factor: number): void {
		this.rescroll(range => scaleScroll(this.scroll, range, factor));
	}

	public setMetadata(change: Partial<Metadata>): void {
		this.commit({
			...this.doc, metadata: {
				...this.metadata, ...change, 
			}, 
		});
	}

	/** What the map checks find in the chart as it stands. */
	public checks(): Issue[] {
		return checkChart({
			doc: this.doc,
			keys: this.chart.keys,
			audioLength: this.songMs,
			audio: this.chart.audio,
			background: this.chart.background,
			otherVersions: this.beatmap.set.beatmaps
				.filter(beatmap => !beatmap.is(this.beatmap))
				.map(beatmap => beatmap.metadata.version),
		});
	}

	/** This difficulty's text as a new one named `version`, with its notes or without. */
	public asDifficulty(version: string, withNotes: boolean): string {
		return withoutBeatmapId(writeChart(this.chart, {
			...this.doc,
			notes: withNotes ? this.notes : [],
			metadata: {
				...this.metadata, version, 
			},
		}));
	}

	public async save(): Promise<void> {
		const doc = this.doc;
		const text = this.text();
		const switches = this.switches;
		// saved either way; switched to another difficulty meanwhile, the session is on that one
		if (!this.took(await saveChart(this.beatmap, text, doc.metadata, writeExtras(doc)), switches)) {
			return;
		}
		void this.followFolder();
		this.chart = {
			...this.chart, ...doc, text,
		};
		this.saved = doc;
		this.changed();
	}

	/** The ids the server gave the set on upload, in its stored files and in this chart. */
	public async takeIds(ids: UploadIds): Promise<void> {
		const beatmapId = ids.beatmaps[this.beatmap.metadata.file ?? ''];
		const switches = this.switches;
		if (!this.took(await writeIds(this.beatmap, ids), switches)) return;
		if (beatmapId !== undefined) {
			this.chart = {
				...this.chart, text: withFileIds(this.chart.text, {
					setId: ids.setId, beatmapId, 
				}), 
			};
		}
		this.changed();
	}

	// ---- view ----

	/** `time` on the nearest beat line, or the one before it with "nearest" off. */
	public snap(time: number): number {
		return snapTime(this.timing, time, snapAt(this.timing, time, this.divisor),
			!currentPlacing().nearestTick);
	}

	/** The snap of the lines a step from `time` goes along: its section's, else the beat snap. */
	private lineDivisor(time: number, direction: 1 | -1): number {
		return snapAt(this.timing, direction < 0 ? time - 1 : time, this.divisor);
	}

	private section?: TimingPoint;

	/** The beat snap switches to a section's own as `time` enters it. */
	public followSection(time: number): void {
		const point = inEffect(this.timing, time) ?? this.timing[0];
		if (point === this.section) return;
		this.section = point;
		if (point?.snap && point.snap !== this.divisor) this.setDivisor(point.snap);
	}

	/** Give a BPM point's section a beat snap of its own, or none. */
	public setSectionSnap(point: TimingPoint, snap: number | undefined): void {
		this.updateTimingPoint(point, { snap });
	}

	/** Snap to 1/`divisor`, adding it to the snaps offered when it is new. */
	public setDivisor(divisor: number): void {
		if (!this.divisors.includes(divisor)) {
			this.divisors = [...this.divisors, divisor].sort((a, b) => a - b);
		}
		this.divisor = divisor;
		this.changed();
	}

	/** The next snap offered, finer (1) or coarser (-1), wrapping around. */
	public cycleDivisor(direction: 1 | -1): void {
		const at = this.divisors.indexOf(this.divisor);
		this.setDivisor(this.divisors[(at + direction + this.divisors.length) % this.divisors.length]);
	}

	public get zoom(): number {
		return zoom.get();
	}

	public zoomBy(factor: number): void {
		void zoom.set(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor)));
		this.changed();
	}

	public get tool(): EditorTool {
		const current = tool.get();
		return TOOLS.includes(current) ? current : 'hold';
	}

	public setTool(next: EditorTool): void {
		void tool.set(next);
		this.changed();
	}

	/** The next tool along (Tab). */
	public cycleTool(): void {
		this.setTool(TOOLS[(TOOLS.indexOf(this.tool) + 1) % TOOLS.length]);
	}

	// ---- clock ----

	private lastNote = {
		notes: [] as Note[], end: 0, 
	};

	/** The last moment worth scrolling to: the track's end or the last note's. */
	public get length(): number {
		if (this.lastNote.notes !== this.notes) {
			this.lastNote = {
				notes: this.notes, end: this.notes.reduce((end, note) => Math.max(end, note.end ?? note.time), 0),
			};
		}
		return Math.max(this.songMs, this.lastNote.end + 2000);
	}

	/** `performance.now()` when the song last started playing, from `pausedAt`. The editor
	 *  keeps its own clock, the track plays alongside: the audio clock moves in steps. */
	private startedAt = 0;

	/** Song ms per real ms: the playback speed. */
	private rate = 1;

	private keepPitch = true;

	private trackTime(): number {
		return this.pausedAt + (performance.now() - this.startedAt) * this.rate;
	}

	/** The clock as the playfield's worker runs it, on its own frames. */
	public get clock(): PlayfieldClock {
		return {
			playing: this.playing,
			pausedAt: this.pausedAt,
			startedAt: this.startedAt,
			length: this.length,
			rate: this.rate,
		};
	}

	/** Start the track, and the clock, at `pausedAt`. */
	private start(): void {
		// heard where it's shown: the output takes a moment to play what's scheduled
		music.playGameplay(this.pausedAt / this.rate + music.outputDelay());
		this.startedAt = performance.now();
		this.sounds.start();
	}

	/** The speed last chosen (the track may still be getting ready for it). */
	public get speed(): number {
		return this.target;
	}

	/** The speed the song plays at right now. */
	public get playbackRate(): number {
		return this.rate;
	}

	private target = 1;

	/** The next speed up (1) or down (-1). */
	public stepSpeed(direction: 1 | -1): Promise<void> {
		const at = SPEEDS.indexOf(this.target);
		const from = at < 0 ? SPEEDS.indexOf(1) : at;
		const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))];
		return this.setSpeed(next);
	}

	public get pitchKept(): boolean {
		return this.keepPitch;
	}

	/** Play at `rate` times the song's speed, its pitch kept or following; the clock
	 *  carries on where it was. */
	public async setSpeed(rate: number, keepPitch = this.keepPitch): Promise<void> {
		if (rate === this.target && keepPitch === this.keepPitch) return;
		// the song plays on while the track is made; a newer change drops this one
		const change = ++this.speedChanges;
		this.target = rate;
		this.changed();
		const audio = await music.prepareGameplay(this.beatmap, rate, !keepPitch, true);
		if (change !== this.speedChanges) return;
		this.songMs = music.gameDuration() * rate;
		const playing = this.playing;
		this.pause();
		this.rate = rate;
		this.keepPitch = keepPitch;
		this.audio = audio;
		if (playing) this.play();
		this.changed();
	}

	private speedChanges = 0;

	public now(): number {
		if (!this.playing) return this.pausedAt;
		const now = this.trackTime();
		if (now >= this.length) this.pause();
		return Math.min(now, this.length);
	}

	public get isPlaying(): boolean {
		return this.playing;
	}

	public play(): void {
		if (this.playing || !this.audio) return;
		this.playing = true;
		this.start();
		this.changed();
	}

	public pause(): void {
		if (!this.playing) return;
		this.pausedAt = Math.min(this.trackTime(), this.length);
		this.playing = false;
		this.sounds.stop();
		music.pauseGameplay();
		this.changed();
	}

	public toggle(): void {
		if (this.playing) this.pause();
		else this.play();
	}

	public seek(time: number): void {
		this.pausedAt = Math.min(Math.max(0, time), this.length);
		if (this.playing) this.start();
		this.changed();
	}

	/** Seek to `time`; with `extend`, the notes starting on the way are added to the
	 *  selection (Quaver's shift seeks). */
	public seekTo(time: number, extend = false): void {
		const from = this.now();
		this.seek(time);
		if (!extend) return;
		const [low, high] = [Math.min(from, this.now()) - 2, Math.max(from, this.now()) + 2];
		this.select(this.notes.filter(note => note.time >= low && note.time <= high), true);
	}

	/** A millisecond on (1) or back (-1), while paused. */
	public nudgeTime(direction: 1 | -1, extend = false): void {
		if (!this.playing) this.seekTo(this.pausedAt + direction, extend);
	}

	/** The selection's start, or the end of its last note. */
	public seekSelection(edge: 'start' | 'end', extend = false): void {
		const selection = this.selection;
		if (!selection.length) return;
		this.seekTo(edge === 'start' ? Math.min(...selection.map(note => note.time))
			: Math.max(...selection.map(note => note.end ?? note.time)), extend);
	}

	/** The first note, or the end of the last one. */
	public seekMap(edge: 'start' | 'end', extend = false): void {
		const notes = this.notes;
		const time = !notes.length ? (edge === 'start' ? 0 : this.length)
			: edge === 'start' ? Math.min(...notes.map(note => note.time))
				: Math.max(...notes.map(note => note.end ?? note.time));
		this.seekTo(time, extend);
	}

	/** Move `count` beat lines forward (1) or back (-1). While playing a step takes
	 *  `PLAYING_STEPS` more, as Quaver's: the track moves on meanwhile, and the next
	 *  line along is often only a few ms ahead of it. */
	public step(direction: 1 | -1, count = 1, extend = false): void {
		let time = this.now();
		const lines = count + (this.playing ? PLAYING_STEPS : 0);
		const stops = this.stops();
		for (let i = 0; i < lines; i++) {
			time = stepToward(this.timing, stops, time, this.lineDivisor(time, direction), direction);
		}
		this.seekTo(time, extend);
	}

	private stopsOf?: { notes: Note[], timing: TimingPoint[], times: number[] };

	/** Where a step stops besides the beat lines: every note's head and end, and every BPM
	 *  point, those there for effect included (off the lines, they would be stepped over). */
	private stops(): number[] {
		const { notes, timing } = this;
		if (this.stopsOf?.notes !== notes || this.stopsOf.timing !== timing) {
			const times = new Set<number>(timing.map(point => point.time));
			for (const note of notes) {
				times.add(note.time);
				if (note.end !== undefined) times.add(note.end);
			}
			this.stopsOf = {
				notes, timing, times: [...times].sort((a, b) => a - b),
			};
		}
		return this.stopsOf.times;
	}

}

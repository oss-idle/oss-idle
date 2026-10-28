import {
	OSU_MODE,
	type OsuMode,
	type RulesetId,
	rulesetOf,
	RULESETS,
} from '../../ids.js';

/** A mania note as the editor holds it; `end` makes it a long note. The hitsound
 *  fields are carried verbatim so keysounds survive an edit. */
export type Note = {
	time: number,
	column: number,
	end?: number,
	hitSound: string,
	sample: string,
};

/** A timing point: an uninherited (BPM) one, or a scroll speed (SV) one, whose
 *  `beatLength` is -100 / its multiplier. */
export type TimingPoint = {
	time: number,
	beatLength: number,
	meter: number,
	/** sample set, sample index and volume, as written */
	sound: string,
	effects: string,
	/** the beat snap its section is mapped in (a BPM point's), kept in the .oss file */
	snap?: number,
};

export type Metadata = {
	title: string,
	titleUnicode: string,
	artist: string,
	artistUnicode: string,
	creator: string,
	version: string,
	source: string,
	tags: string,
	previewTime: number,
};

/** What the editor edits; the rest of the file is written back as it was read. */
export type ChartDoc = {
	notes: Note[],
	timing: TimingPoint[],
	/** scroll speed points */
	scroll: TimingPoint[],
	metadata: Metadata,
	/** times marked in the editor, as osu!'s [Editor] Bookmarks */
	bookmarks: number[],
};

export type Chart = ChartDoc & {
	text: string,
	keys: number,
	/** the song's file name */
	audio: string,
	/** whether [Events] sets a background image */
	background: boolean,
};

export const DIVISORS = [1, 2, 3, 4, 6, 8, 12, 16];
export const MAX_DIVISOR = 48;

const DEFAULT_SAMPLE = '0:0:0:0:';

/** [Metadata] keys, by the field that holds them. */
const METADATA_KEYS: Record<Exclude<keyof Metadata, 'previewTime'>, string> = {
	title: 'Title',
	titleUnicode: 'TitleUnicode',
	artist: 'Artist',
	artistUnicode: 'ArtistUnicode',
	creator: 'Creator',
	version: 'Version',
	source: 'Source',
	tags: 'Tags',
};

const isHeader = (line: string) => /^\[.+\]$/.test(line.trim());

/** The [name] section's line range: [first content line, end) */
const sectionRange = (lines: string[], name: string): [number, number] | undefined => {
	const header = lines.findIndex(line => line.trim() === `[${name}]`);
	if (header < 0) return undefined;
	const next = lines.findIndex((line, i) => i > header && isHeader(line));
	return [header + 1, next < 0 ? lines.length : next];
};

const sectionLines = (lines: string[], name: string): string[] => {
	const range = sectionRange(lines, name);
	return range
		? lines.slice(...range).filter(line => line.trim() && !line.startsWith('//'))
		: [];
};

/** The section's content swapped for `content`, or the section added with it. */
const replaceSection = (lines: string[], name: string, content: string[]): string[] => {
	const range = sectionRange(lines, name);
	if (!range) return [...lines, `[${name}]`, ...content, ''];
	return [...lines.slice(0, range[0]), ...content, '', ...lines.slice(range[1])];
};

const valueOf = (lines: string[], section: string, key: string): string =>
	sectionLines(lines, section).find(line => line.startsWith(`${key}:`))
		?.slice(key.length + 1).trim() ?? '';

/** `key` set to `value` in `section`, keeping the file's own spacing after the colon. */
const withValue = (lines: string[], section: string, key: string, value: string): string[] => {
	const range = sectionRange(lines, section);
	if (!range) return [...lines, `[${section}]`, `${key}:${value}`, ''];
	const at = lines.findIndex((line, i) =>
		i >= range[0] && i < range[1] && line.startsWith(`${key}:`));
	if (at >= 0) {
		const space = /^[^:]*:(\s*)/.exec(lines[at])![1];
		return lines.map((line, i) => (i === at ? `${key}:${space}${value}` : line));
	}
	let last = range[1];
	while (last > range[0] && !lines[last - 1].trim()) last--;
	return [...lines.slice(0, last), `${key}:${value}`, ...lines.slice(last)];
};

/** `key` taken out of `section`. */
const withoutValue = (lines: string[], section: string, key: string): string[] => {
	const range = sectionRange(lines, section);
	if (!range) return lines;
	return lines.filter((line, i) => i < range[0] || i >= range[1] || !line.startsWith(`${key}:`));
};

const parseBookmarks = (lines: string[]): number[] =>
	valueOf(lines, 'Editor', 'Bookmarks').split(',').filter(value => value.trim()).map(Number)
		.filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);

const parseNote = (line: string, keys: number): Note => {
	const [x, , time, type, hitSound = '0', ...rest] = line.split(',');
	const column = Math.min(keys - 1, Math.max(0, Math.floor(Number(x) * keys / 512)));
	const extras = rest.join(',');
	if (Number(type) & 128) {
		const [end, ...sample] = extras.split(':');
		return {
			time: Number(time), column, end: Number(end), hitSound, sample: sample.join(':') || DEFAULT_SAMPLE,
		};
	}
	return {
		time: Number(time), column, hitSound, sample: extras || DEFAULT_SAMPLE,
	};
};

const isUninherited = (fields: string[]) => Number(fields[1]) > 0 && fields[6] !== '0';

const parseTiming = (line: string): TimingPoint => {
	const fields = line.split(',');
	return {
		time: Number(fields[0]),
		beatLength: Number(fields[1]),
		meter: Number(fields[2]) || 4,
		sound: fields.length >= 6 ? fields.slice(3, 6).join(',') : '0,0,100',
		effects: fields[7] ?? '0',
	};
};

const byStart = (a: TimingPoint, b: TimingPoint) => a.time - b.time;

const parseTimingPoints = (lines: string[]): Pick<ChartDoc, 'timing' | 'scroll'> => {
	const all = sectionLines(lines, 'TimingPoints');
	return {
		timing: all.filter(line => isUninherited(line.split(','))).map(parseTiming).sort(byStart),
		scroll: all.filter(line => !isUninherited(line.split(','))).map(parseTiming).sort(byStart),
	};
};

/** A scroll speed point's multiplier: 1 is the map's base speed. */
export const multiplierOf = (point: TimingPoint): number =>
	(point.beatLength < 0 ? -100 / point.beatLength : 1);

export const scrollBeatLength = (multiplier: number): number => -100 / multiplier;

const parseMetadata = (lines: string[]): Metadata => ({
	...Object.fromEntries(Object.entries(METADATA_KEYS)
		.map(([field, key]) => [field, valueOf(lines, 'Metadata', key)])) as Omit<Metadata, 'previewTime'>,
	previewTime: Number(valueOf(lines, 'General', 'PreviewTime') || -1),
});

export const parseChart = (text: string): Chart => {
	const lines = text.split(/\r?\n/);
	const size = valueOf(lines, 'Difficulty', 'CircleSize');
	const keys = Math.max(1, Math.round(Number(size) || 4));
	return {
		text,
		keys,
		audio: valueOf(lines, 'General', 'AudioFilename'),
		background: sectionLines(lines, 'Events').some(line => /^0,0,/.test(line)),
		notes: sectionLines(lines, 'HitObjects').map(line => parseNote(line, keys)),
		...parseTimingPoints(lines),
		metadata: parseMetadata(lines),
		bookmarks: parseBookmarks(lines),
	};
};

const noteLine = (note: Note, keys: number): string => {
	const x = Math.floor((note.column + 0.5) * 512 / keys);
	return note.end === undefined
		? `${x},192,${note.time},1,${note.hitSound},${note.sample}`
		: `${x},192,${note.time},128,${note.hitSound},${note.end}:${note.sample}`;
};

const timingLine = (point: TimingPoint, uninherited: 0 | 1): string =>
	`${point.time},${point.beatLength},${point.meter},${point.sound},${uninherited},${point.effects}`;

export const byTime = (a: Note, b: Note) => a.time - b.time || a.column - b.column;

/** The BPM and scroll speed points in time order, a BPM point before an SV one at the same time. */
const timingLines = (doc: ChartDoc): string[] => [
	...doc.timing.map(point => ({
		point, uninherited: 1 as const, 
	})),
	...doc.scroll.map(point => ({
		point, uninherited: 0 as const, 
	})),
]
	.sort((a, b) => a.point.time - b.point.time || b.uninherited - a.uninherited)
	.map(({ point, uninherited }) => timingLine(point, uninherited));

const SET_FIELDS = [
	'title', 'titleUnicode', 'artist', 'artistUnicode', 'creator', 'source', 'tags',
] as const;

/** `metadata`'s fields written into the file: every field, or `set` - the ones a
 *  set's difficulties share - only. */
const withMetadata = (lines: string[], metadata: Metadata, set: boolean): string[] => {
	const fields = set ? SET_FIELDS : Object.keys(METADATA_KEYS) as (keyof typeof METADATA_KEYS)[];
	const written = fields.reduce(
		(acc, field) => withValue(acc, 'Metadata', METADATA_KEYS[field], metadata[field]), lines,
	);
	return withValue(written, 'General', 'PreviewTime', String(metadata.previewTime));
};

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

/** The chart's text with `doc` written into it. */
export const writeChart = (chart: Chart, doc: ChartDoc): string => {
	const lines = chart.text.split(/\r?\n/);
	const objects = [...doc.notes].sort(byTime).map(note => noteLine(note, chart.keys));
	const withNotes = replaceSection(lines, 'HitObjects', objects);
	const withTiming = replaceSection(withNotes, 'TimingPoints', timingLines(doc));
	const withBookmarks = doc.bookmarks.length
		? withValue(withTiming, 'Editor', 'Bookmarks', doc.bookmarks.map(Math.round).join(','))
		: withoutValue(withTiming, 'Editor', 'Bookmarks');
	return withMetadata(withBookmarks, doc.metadata, false).join(eolOf(chart.text));
};

/** A chart with no notes outside ruleset `id` (osu!'s featured artist templates are osu!
 *  ones) as one of its charts; any other chart as it is. */
export const emptyIn = (text: string, id: RulesetId): string => {
	const lines = text.split(/\r?\n/);
	const ruleset: { mode: OsuMode, keys?: number } = RULESETS[id];
	const keys = Math.round(Number(valueOf(lines, 'Difficulty', 'CircleSize')));
	const inside = rulesetOf(Number(valueOf(lines, 'General', 'Mode') || 0), keys) === id;
	if (inside || sectionLines(lines, 'HitObjects').length) return text;
	const moved = withValue(lines, 'General', 'Mode', String(OSU_MODE[ruleset.mode]));
	return (ruleset.keys ? withValue(moved, 'Difficulty', 'CircleSize', String(ruleset.keys)) : moved)
		.join(eolOf(text));
};

/** Another difficulty's text with the set-wide metadata (all but its name) of `metadata`. */
export const withSetMetadata = (text: string, metadata: Metadata): string =>
	withMetadata(text.split(/\r?\n/), metadata, true).join(eolOf(text));

/** The background image an [Events] line names, if any. */
export const backgroundOf = (text: string): string | undefined => {
	const line = sectionLines(text.split(/\r?\n/), 'Events').find(l => /^0,0,/.test(l));
	return line ? /^0,0,"?([^",]*)"?/.exec(line)?.[1] : undefined;
};

/** The text with `file` as its background image, in place of any it had. */
export const withBackground = (text: string, file: string): string => {
	const lines = text.split(/\r?\n/);
	const range = sectionRange(lines, 'Events');
	const line = `0,0,"${file}",0,0`;
	if (!range) return [...lines, '[Events]', line, ''].join(eolOf(text));
	const at = lines.findIndex((l, i) => i >= range[0] && i < range[1] && /^0,0,/.test(l));
	const next = at >= 0
		? lines.map((l, i) => (i === at ? line : l))
		: [...lines.slice(0, range[0]), line, ...lines.slice(range[0])];
	return next.join(eolOf(text));
};

/** Our map ids count from 1e9 (0056_map_ids): an id in a file below it is osu!'s. */
export const OWN_ID_FROM = 1_000_000_000;

/** The ids a .osu carries, when it has real ones. */
export type FileIds = { setId?: number, beatmapId?: number };

const idOf = (value: string) => {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : undefined;
};

export const fileIdsOf = (text: string): FileIds => {
	const lines = text.split(/\r?\n/);
	return {
		setId: idOf(valueOf(lines, 'Metadata', 'BeatmapSetID')),
		beatmapId: idOf(valueOf(lines, 'Metadata', 'BeatmapID')),
	};
};

/** The text with the ids the server gave it. */
export const withFileIds = (text: string, { setId, beatmapId }: Required<FileIds>): string => {
	const withSet = withValue(text.split(/\r?\n/), 'Metadata', 'BeatmapSetID', String(setId));
	return withValue(withSet, 'Metadata', 'BeatmapID', String(beatmapId)).join(eolOf(text));
};

/** The text of a new difficulty: no BeatmapID yet, the server gives it one. */
export const withoutBeatmapId = (text: string): string =>
	withValue(text.split(/\r?\n/), 'Metadata', 'BeatmapID', '0').join(eolOf(text));

/** osu!'s effects bit leaving out a BPM point's first bar line. */
const OMIT_FIRST_BAR_LINE = 8;

export const omitsFirstBarLine = (point: TimingPoint): boolean =>
	(Number(point.effects) & OMIT_FIRST_BAR_LINE) !== 0;

export const withOmitFirstBarLine = (point: TimingPoint, omit: boolean): TimingPoint => {
	const effects = Number(point.effects) || 0;
	return {
		...point,
		effects: String(omit ? effects | OMIT_FIRST_BAR_LINE : effects & ~OMIT_FIRST_BAR_LINE),
	};
};

/** The point in effect at `time`: the last of `points` (in time order) at or before it. */
export const inEffect = (points: TimingPoint[], time: number): TimingPoint | undefined => {
	let low = 0;
	let high = points.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (points[mid].time <= time) low = mid + 1;
		else high = mid;
	}
	return points[low - 1];
};

/** The beat lengths a beat grid is laid on (1 to 1200 BPM): a point outside them is there for
 *  effect (a map standing still at 999999999 ms, or speeding past at 1 or 33 ms), and the grid
 *  carries on past it. */
const GRID_BEATS = {
	min: 50, max: 60_000,
};
const grids = new WeakMap<TimingPoint[], TimingPoint[]>();

/** The BPM points the beat grid follows (all of them when none is in range), kept per list:
 *  a draw loop asks every frame. */
export const gridOf = (timing: TimingPoint[]): TimingPoint[] => {
	let grid = grids.get(timing);
	if (!grid) {
		grid = timing.filter(p => p.beatLength >= GRID_BEATS.min && p.beatLength <= GRID_BEATS.max);
		if (!grid.length) grid = timing;
		grids.set(timing, grid);
	}
	return grid;
};

const timingAt = (timing: TimingPoint[], time: number): TimingPoint | undefined => {
	const grid = gridOf(timing);
	return inEffect(grid, time) ?? grid[0];
};

/** The beat snap at `time`: its section's own, else `divisor`. */
export const snapAt = (timing: TimingPoint[], time: number, divisor: number): number =>
	timingAt(timing, time)?.snap ?? divisor;

/** `time` moved onto the nearest 1/`divisor` beat line, or with `back` the one at or
 *  before it. */
export const snapTime = (
	timing: TimingPoint[],
	time: number,
	divisor: number,
	back = false,
): number => {
	const point = timingAt(timing, time);
	if (!point) return Math.round(time);
	const step = point.beatLength / divisor;
	const lines = (time - point.time) / step;
	return Math.round(point.time + (back ? Math.floor(lines + 1e-6) : Math.round(lines)) * step);
};

/** The next 1/`divisor` beat line after (`direction` 1) or before (-1) `time`. */
export const stepTime = (
	timing: TimingPoint[],
	time: number,
	divisor: number,
	direction: 1 | -1,
): number => {
	const point = timingAt(timing, direction < 0 ? time - 1 : time);
	if (!point) return time + direction * 100;
	const step = point.beatLength / divisor;
	const at = (time - point.time) / step;
	const nearest = Math.round(at);
	const onLine = Math.abs(at - nearest) * step < 1;
	const index = direction > 0
		? (onLine ? nearest + 1 : Math.ceil(at))
		: (onLine ? nearest - 1 : Math.floor(at));
	const next = Math.round(point.time + index * step);
	const boundary = gridOf(timing).find(p => p.time > time);
	const stepped = direction > 0 && boundary && next > boundary.time ? boundary.time : next;
	// lines closer than a ms round back onto the time: a step always moves on
	return direction > 0 ? Math.max(stepped, time + 1) : Math.min(stepped, time - 1);
};

/** The next beat line after (`direction` 1) or before (-1) `time`, or a stop of `stops`
 *  (times in order: notes, BPM points) on the way there - one off the lines is landed on. */
export const stepToward = (
	timing: TimingPoint[],
	stops: number[],
	time: number,
	divisor: number,
	direction: 1 | -1,
): number => {
	const next = stepTime(timing, time, divisor, direction);
	// the first stop past `time` going forward, the last before it going back
	let low = 0;
	let high = stops.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (direction > 0 ? stops[mid] <= time : stops[mid] < time) low = mid + 1;
		else high = mid;
	}
	const stop = direction > 0 ? stops[low] : stops[low - 1];
	if (stop === undefined) return next;
	return direction > 0 ? Math.min(next, stop) : Math.max(next, stop);
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export type SnapLine = {
	time: number,
	/** the smallest divisor this line belongs to: 1 on the beat, 2 halfway, … */
	denominator: number,
	measure: boolean,
};

/** Each beat line from `from` to `to`, a section in its own snap or else `snap`, handed to
 *  `visit` as it goes: no array, for a draw loop. */
export const eachSnapLine = (
	timing: TimingPoint[],
	from: number,
	to: number,
	snap: number,
	visit: (time: number, denominator: number, measure: boolean) => void,
): void => {
	const grid = gridOf(timing);
	for (let i = 0; i < grid.length; i++) {
		const point = grid[i];
		const divisor = point.snap ?? snap;
		const step = point.beatLength / divisor;
		const start = i === 0 ? from : Math.max(from, point.time);
		const end = Math.min(to, grid[i + 1]?.time ?? Infinity);
		const bar = divisor * point.meter;
		for (let k = Math.ceil((start - point.time) / step); point.time + k * step < end; k++) {
			const inBeat = ((k % divisor) + divisor) % divisor;
			visit(point.time + k * step, divisor / gcd(inBeat, divisor), ((k % bar) + bar) % bar === 0);
		}
	}
};

export const snapLines = (
	timing: TimingPoint[],
	from: number,
	to: number,
	divisor: number,
): SnapLine[] => {
	const lines: SnapLine[] = [];
	eachSnapLine(timing, from, to, divisor, (time, denominator, measure) => lines.push({
		time, denominator, measure,
	}));
	return lines;
};

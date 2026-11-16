import {
	ControlPointGroup,
	ControlPointInfo,
} from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import {
	type TailOnly,
	tailOnlyHold,
} from './playableChart.js';

export type { TailOnly } from './playableChart.js';

/**
 * osu-classes' `ControlPointInfo.groupAt` does a linear `.find` *and a full
 * `.sort()` of the whole group list on every control-point insertion* - so
 * decoding is O(n² log n) in the number of control points. Most maps have a
 * handful, but SV-heavy maps carry tens of thousands (Camellia – Singularity
 * has ~23 400 timing points), which turns a single decode into a multi-second
 * main-thread stall - felt as a freeze when the map is selected on the client
 * and as multi-second play setup on the server.
 *
 * This replaces `groupAt` with an O(1) map lookup plus a binary-search sorted
 * insert (no full re-sort), bringing that same decode from ~3.6s to ~70ms. The
 * `groups` array stays sorted and identical to before; behaviour is unchanged.
 *
 * Imported for side effect at every decode site. Idempotent and self-healing:
 * the time→group index is rebuilt whenever it falls out of sync with `groups`
 * (e.g. after `clear()` empties the list).
 */

 
type Patchable = ControlPointInfo & { __groupMap?: Map<number, ControlPointGroup> };

ControlPointInfo.prototype.groupAt = function (
	this: Patchable, 
	time: number,
): ControlPointGroup {
	let map = this.__groupMap;
	if (!map || map.size !== this.groups.length) {
		map = this.__groupMap = new Map(this.groups.map((g) => [g.startTime, g]));
	}

	let group = map.get(time);
	if (!group) {
		group = new ControlPointGroup(time);
		map.set(time, group);
		// insert keeping `groups` ascending by startTime, without re-sorting
		const groups = this.groups;
		let lo = 0;
		let hi = groups.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (groups[mid].startTime < time) lo = mid + 1;
			else hi = mid;
		}
		groups.splice(lo, 0, group);
	}
	return group;
};

/** osu-parsers drops a timing point whose beat length is past ±2147483647; stable reads it.
 *  Mappers write 0 BPM as 1e11 or 1.8e308, and near-zero SV the same way. Read at the bound,
 *  they scroll as at their own value: a stopped scroll, or the lowest SV. A negative red
 *  line that large stays dropped. */
const PARSE_LIMIT = 2147483647;

const boundBeatLength = (line: string): string => {
	const fields = line.split(',');
	const beatLength = Number(fields[1]);
	if (!(Math.abs(beatLength) > PARSE_LIMIT)) return line;
	const red = fields.length < 7 || fields[6] === '1';
	if (red && beatLength < 0) return line;
	fields[1] = String(Math.sign(beatLength) * PARSE_LIMIT);
	return fields.join(',');
};

/** The tail-only holds a map leaves out of its hit objects; {@link tailOnlyOf} keeps them. */
const tailsOf = new WeakMap<object, TailOnly[]>();

/** The tail-only holds of a map this decoder read. */
export const tailOnlyOf = (beatmap: object): TailOnly[] => tailsOf.get(beatmap) ?? [];

/** A red line as the map writes it. The parser drops a red line that repeats the one before
 *  it, but each one draws its bar line (SV maps draw art with runs of them), and merges its
 *  omit flag with a green line's at the same time, whose flag then wins. */
export type RedLine = {
	time: number, beatLength: number, meter: number, omitFirstBarline: boolean,
};

const redLines = new WeakMap<object, RedLine[]>();

/** The red lines of a map this decoder read, in time order (the last one at a time). */
export const redLinesOf = (beatmap: object): RedLine[] | undefined => redLines.get(beatmap);

const OMIT_FIRST_BARLINE = 8;

/** Files before v5 are read 24ms later, as osu-parsers does. */
const EARLY_OFFSET = 24;

const redLine = (line: string, offset: number): RedLine | undefined => {
	const fields = line.split(',');
	if (fields.length < 2 || (fields.length >= 7 && fields[6] !== '1')) return undefined;
	const time = Number(fields[0]) + offset;
	const beatLength = Number(fields[1]);
	if (!Number.isFinite(time) || !(beatLength > 0)) return undefined;
	return {
		time,
		beatLength,
		meter: Math.max(1, Number(fields[2]) || 4),
		omitFirstBarline: (Number(fields[7]) & OMIT_FIRST_BARLINE) !== 0,
	};
};

const decodeFromLines = BeatmapDecoder.prototype.decodeFromLines;
BeatmapDecoder.prototype.decodeFromLines = function (this: BeatmapDecoder, data, options) {
	let section = '';
	const tails: TailOnly[] = [];
	const reds = new Map<number, RedLine>();
	const version = Number(/osu file format v(\d+)/.exec(data[0] ?? '')?.[1] ?? 14);
	const offset = version < 5 ? EARLY_OFFSET : 0;
	const beatmap = decodeFromLines.call(this, data.map((line) => {
		if (line.startsWith('[')) section = line.trim();
		if (section === '[TimingPoints]') {
			const red = redLine(line, offset);
			if (red) reds.set(red.time, red);
			return boundBeatLength(line);
		}
		const tail = section === '[HitObjects]' ? tailOnlyHold(line) : undefined;
		if (!tail) return line;
		tails.push(tail);
		return '';
	}), options);
	if (tails.length) tailsOf.set(beatmap, tails);
	redLines.set(beatmap, [...reds.values()].sort((a, b) => a.time - b.time));
	return beatmap;
};

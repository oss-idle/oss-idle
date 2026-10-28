import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

/** Production beatmap API - the row carries the full `.osu` in its `chart` field. */
const API = 'https://api.oss.idle.rhythmgamers.net/v1/beatmap';
const CACHE_DIR = fileURLToPath(new URL('../.charts-cache/', import.meta.url));
const decoder = new BeatmapDecoder();
const cache = new Map<number, Beatmap>();

/** Fetch a chart's `.osu` from the API, caching it to disk for offline reruns. */
export async function fetchChart(id: number): Promise<string> {
	const file = `${CACHE_DIR}${id}.osu`;
	if (existsSync(file)) return readFileSync(file, 'utf8');

	const res = await fetch(`${API}/${id}`);
	if (!res.ok) throw new Error(`fetch beatmap ${id}: ${res.status} ${res.statusText}`);
	const { chart } = await res.json() as { chart: string };

	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(file, chart);
	return chart;
}

/** Fetch + decode a chart by beatmap id (cached in memory and on disk). Call this
 *  before {@link getBeatmap} to warm the cache; the harness then reads it synchronously. */
export async function loadBeatmap(id: number): Promise<Beatmap> {
	let beatmap = cache.get(id);
	if (!beatmap) {
		beatmap = decoder.decodeFromString(await fetchChart(id));
		cache.set(id, beatmap);
	}
	return beatmap;
}

/** The already-loaded chart for `id` (from the in-memory cache). Throws if it was
 *  not {@link loadBeatmap}ed first - keeps the play path synchronous. */
export function getBeatmap(id: number): Beatmap {
	const beatmap = cache.get(id);
	if (!beatmap) throw new Error(`beatmap ${id} not loaded - call loadBeatmap(${id}) first`);
	return beatmap;
}

export const CHARTS = {
	'1-eternal-white': 3525701,
	'1-refresh': 606497,
	'1-this-will-be-the-day': 360806,
	'2-air': 769867,
	'2-homoneko': 729013,
	'2-pupa': 803578,
	'2-redline': 3794084,
	'3-baku': 721999,
	'3-haru': 758531,
	'4-blu': 667736,
	'4-dream': 908398,
	'4-soul': 554742,
	'4.5-haloz': 577429,
	'4.5-over': 718998,
	'4.5-tokyo': 736931,
	'4.5-world': 4202105,
	'5-c18': 689769,
	'5-dream': 1146184,
	'5-neo': 1055022,
	'5-tokyo': 747621,
	'6-aiae': 421066,
	'6-quartz': 2485796,
	'6-shaper': 823842,
	'm-parallax': 1443309,
	's-singularity': 1073952,
	'slow-stress': 1802667,
	'vital vitriol 1.0': 2066504,
	'cyanine beginner': 1522933,
	'first 1.13*': 1124739,
	'wing of zero 3.14*': 319283,
	'blue army 3.15*': 239327,
	'she sings in the morning 3.18*': 1139501,
} as const;

export const EZ = [
	CHARTS['1-eternal-white'], 
	CHARTS['1-refresh'], 
	CHARTS['1-this-will-be-the-day'],
];
export const HD = [CHARTS['3-baku'], CHARTS['3-haru']];
export const IX = [CHARTS['4-blu'], CHARTS['4-dream'], CHARTS['4-soul']];


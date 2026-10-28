import { createHash } from 'node:crypto';

import * as ppjs from 'rosu-pp-js';

import type { Mod } from '@oss-idle/shared/mods';
import {
	rateKey,
	RATES,
} from '@oss-idle/shared/rate';
import type {
	PerformanceScore,
	RulesetDef,
} from '@oss-idle/shared/rulesets/ruleset';

/** How many charts' difficulty {@link calculatePP} keeps: each one priced again
 *  costs a parse of the whole chart (up to ~50 ms on an SV-heavy map). */
const DIFFICULTIES = 512;
const difficulties = new Map<string, ppjs.DifficultyAttributes>();

/** The chart's difficulty as `args` price it (their rate and mods), parsed once: kept
 *  by `id` (its checksum) when given, else by a hash of the text. */
const difficultyOf = (
	chart: string | (() => string),
	args: { lazer: boolean, clockRate: number, mods: string },
	id?: string,
) => {
	const text = typeof chart === 'string' ? () => chart : chart;
	const of = id ?? createHash('sha1').update(text()).digest('base64');
	const key = `${of}:${args.lazer}:${args.clockRate}:${args.mods}`;
	let attrs = difficulties.get(key);
	if (attrs) difficulties.delete(key);
	else {
		attrs = new ppjs.Difficulty({
			lazer: args.lazer, clockRate: args.clockRate, mods: args.mods,
		}).calculate(new ppjs.Beatmap(text()));
		if (difficulties.size >= DIFFICULTIES) difficulties.delete(difficulties.keys().next().value!);
	}
	// re-inserted: the map's order is the least recently priced first
	difficulties.set(key, attrs);
	return attrs;
};

/**
 * Performance points for a finished play, computed from the raw `.osu` chart (or
 * one parsed already, to price many plays of a map) and the simulated `ScoreState`,
 * with the node `rosu-pp-js` build (synchronous, no wasm init). A chart given as
 * text is priced from its cached difficulty: the same pp as from the parsed map.
 */
export function calculatePP(
	def: RulesetDef,
	score: PerformanceScore,
	/** the text, how to read it, or the chart parsed */
	chart: string | (() => string) | ppjs.Beatmap,
	rate = 1,
	mods: readonly Mod[] = [],
	/** the chart's checksum: its difficulty is kept by it, the text never hashed */
	id?: string,
): number {
	const args = def.performanceArgs(score, rate, mods) as {
		lazer: boolean, clockRate: number, mods: string,
	};
	const priced = chart instanceof ppjs.Beatmap ? chart : difficultyOf(chart, args, id);
	return new ppjs.Performance(args).calculate(priced).pp;
}

/** The chart's star rating at a playback rate. */
export const starsAt = (chart: string, rate = 1): number =>
	new ppjs.Difficulty({
		lazer: false, clockRate: rate,
	}).calculate(new ppjs.Beatmap(chart)).stars;

/** The chart's stars at every rate but x1, by `rateKey`. */
export const starsAtRates = (chart: string): Record<string, number> =>
	Object.fromEntries(RATES.map(rate => [
		rateKey(rate), Math.round(starsAt(chart, rate) * 1000) / 1000,
	]));

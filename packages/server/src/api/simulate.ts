import { z } from 'zod';

import type {
	ApiSimulateRequest,
	ApiSimulation,
} from '@oss-idle/shared/apiV2';
import { STRAIN_CAP } from '@oss-idle/shared/fatigue';
import {
	cleanMods,
	modsSchema,
} from '@oss-idle/shared/mods';
import {
	allowedRate,
	RATE_STEP,
	rateSchema,
} from '@oss-idle/shared/rate';
import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';
import {
	SKILL,
	Skills,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import { maxUpgrades } from '@oss-idle/shared/upgrades';

import { getLiveBeatmap } from '../beatmaps';
import {
	env,
	isProd,
} from '../env';
import {
	type SimInput,
	type SimResult,
	simulateState,
} from '../rulesets/mania/4k/simState';
import { rulesetFor } from '../rulesets/registry';
import { playOnHosts } from '../simHosts';
import { statistics } from './objects';

const count = (max: number) => z.number().int().min(0).max(max);

const skillState = z.object({
	level: count(1000),
	xp: z.number().min(0).max(1e15).default(0),
	lifetime_xp: z.number().min(0).max(1e15).default(0),
	prestige: count(1000).default(0),
	upgrades: count(1000).default(0),
	overdrive: count(1000).default(0),
}).refine(s => s.upgrades <= maxUpgrades(s.prestige), {
	message: 'More upgrades than the prestige allows', path: ['upgrades'],
});

/** `POST /api/v2/simulate`: a character state and a map. */
export const simulateBody = z.object({
	beatmap_id: z.number().int().positive(),
	rate: rateSchema.refine(
		r => Math.abs(r / RATE_STEP - Math.round(r / RATE_STEP)) < 1e-9,
		`Rates go in steps of ${RATE_STEP}`,
	).default(1),
	mods: modsSchema.default([]),
	generation: count(1000).min(1).default(1),
	strain_minutes: z.number().min(0).max(STRAIN_CAP).default(0),
	map_plays: count(1_000_000).default(0),
	skills: z.partialRecord(z.enum(Skills), skillState).default({}),
});
type SimulateBody = z.infer<typeof simulateBody>;
// the body add-ons are typed with (apiV2) must stay one this takes
({}) as ApiSimulateRequest satisfies z.input<typeof simulateBody>;

export type Refusal = { status: 404 | 422 | 429 | 503, error: string };
const refuse = (status: Refusal['status'], error: string): Refusal => ({
	status, error,
});

/** The play, from the sim services; this server plays it itself where there are none (dev). */
const play = async (input: SimInput, chart: string): Promise<SimResult | Refusal> => {
	if (!env.SIM_SERVICE_URL.length) {
		return isProd ? refuse(503, 'Simulations are unavailable') : simulateState(input, chart);
	}
	return playOnHosts(env.SIM_SERVICE_URL, env.SIM_SERVICE_SECRET ?? '', input, chart);
};

/** The sim API's answer: the play a character in this state would make on a live ranked
 *  or loved 4K map, in API v2's score format, and each skill's xp. */
export const simulate = async (body: SimulateBody): Promise<ApiSimulation | Refusal> => {
	const map = await getLiveBeatmap(rulesetFor(mania4k.id), body.beatmap_id);
	if (!map) return refuse(404, 'No live ranked or loved 4K beatmap has this id');
	const speed = body.skills[SKILL.speed]?.upgrades ?? 0;
	if (allowedRate(body.rate, speed) !== body.rate) {
		return refuse(422, 'The speed upgrades given don\'t allow this rate');
	}
	const mods = cleanMods(body.mods);
	const result = await play({
		beatmapId: map.id,
		checksum: map.checksum,
		state: {
			generation: body.generation,
			strainMinutes: body.strain_minutes,
			mapPlays: body.map_plays,
			skills: Object.fromEntries(Object.entries(body.skills).map(([name, s]) => [name, {
				level: s.level,
				xp: s.xp,
				lifetimeXp: s.lifetime_xp,
				prestige: s.prestige,
				upgrades: s.upgrades,
				overdrive: s.overdrive,
			}])),
		},
		rate: body.rate,
		mods,
	}, map.chart);
	if ('error' in result) return result;
	return {
		beatmap_id: body.beatmap_id,
		rate: body.rate,
		mods,
		score: result.score,
		accuracy: result.accuracy,
		max_combo: result.maxCombo,
		rank: result.grade,
		pp: result.pp,
		perfect: result.pfc,
		passed: result.passed,
		statistics: statistics(mania4k, result.counts),
		unstable_rate: Math.round(result.ur * 100) / 100,
		strained_minutes: Math.round(result.strainedMinutes * 1000) / 1000,
		...result.failProgress !== undefined && {
			fail_progress: result.failProgress, fail_seconds: result.failSeconds,
		},
		xp: result.xp,
	};
};

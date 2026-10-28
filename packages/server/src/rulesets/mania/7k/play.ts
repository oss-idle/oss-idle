import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';

import { warmupTrend } from '@oss-idle/shared/fatigue';
import { allowedRate } from '@oss-idle/shared/rate';
import { modXpMultipliers7k } from '@oss-idle/shared/rulesets/mania/7k/modXp';
import {
	MINDBLOCK_SKILLS_7K,
	PHYSICAL_SKILLS_7K,
	SKILL_7K,
} from '@oss-idle/shared/rulesets/mania/7k/skills';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';

import { getPlays } from '../../../db/schema/beatmaps_played';
import { skillOf } from '../../../db/schema/character';
import { sim } from '../../../sim';
import type { RulesetPlay } from '../../play';
import {
	serverXp,
	tiredness,
} from '../playRules';
import {
	runManiaPlay,
	strainSamples,
} from '../simulate';
import { playStrain } from '../xpRules';

const decoder = new BeatmapDecoder();

// Notes where no physical skill strains past this add no fatigue.
const STRAINED_7K = Object.fromEntries(PHYSICAL_SKILLS_7K.map(skill => [skill, 0.2]));

/** 7K's play: its own bot and skills, mania's engine, the shared fatigue and xp rules. */
export const play: RulesetPlay = {
	tiredness: tiredness(SKILL_7K.stamina),
	allowedRate: (profile, rate) => allowedRate(rate, skillOf(profile, SKILL_7K.speed).upgrades),
	warmupTrend: ({ minutes, strained }) => warmupTrend(minutes, strained),
	async simulate(r, {
		profile, beatmapId, chart: text, sr, rate, mods, round, board, tired,
	}) {
		const { fatigue, warmup: warm } = tired;
		const bot = sim().mania7k.bot({
			progress: skill => skillOf(profile, skill),
			fatigue,
			warm,
			plays: await getPlays(r, profile.id, beatmapId),
		});
		const chart = decoder.decodeFromString(text);
		const options = {
			rate, mods, playOn: round,
		};
		const { game, played: run } = runManiaPlay(chart, bot, options, round);
		const played = {
			...run, strains: strainSamples(bot, r.def.gauged, run.endSongTime),
		};
		if (board) return {
			...played, skillXp: Object.fromEntries(r.def.skills.map(s => [s, 0])),
		};
		const length = chart.totalLength / rate;
		const score = xpScore(chart, game, options);
		return {
			...played,
			skillXp: await serverXp(r, profile.id, beatmapId, bot.getSkillsXP(length, score), {
				mindblock: MINDBLOCK_SKILLS_7K,
				modMultipliers: modXpMultipliers7k(mods),
				grade: score.grade,
				stars: sr,
				fatigue,
			}),
			strain: {
				minutes: length / 60_000,
				strained: playStrain(STRAINED_7K, bot, length),
			},
		};
	},
};

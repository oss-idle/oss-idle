import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';

import { warmupTrend } from '@oss-idle/shared/fatigue';
import { allowedRate } from '@oss-idle/shared/rate';
import { GENETICS_7K } from '@oss-idle/shared/rulesets/mania/7k/genes';
import { modXpMultipliers7k } from '@oss-idle/shared/rulesets/mania/7k/modXp';
import {
	MINDBLOCK_SKILLS_7K,
	PHYSICAL_SKILLS_7K,
	SKILL_7K,
	type SkillName7k,
} from '@oss-idle/shared/rulesets/mania/7k/skills';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';

import {
	geneInput,
	geneticsXp,
} from '../../../character/genetics';
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
export const STRAINED_7K = Object.fromEntries(PHYSICAL_SKILLS_7K.map(skill => [skill, 0.2]));

/** 7K's play: its own bot and skills, mania's engine, the shared fatigue and xp rules. */
export const play: RulesetPlay = {
	tiredness: tiredness(SKILL_7K.stamina, GENETICS_7K),
	allowedRate: (profile, rate) => allowedRate(rate, skillOf(profile, SKILL_7K.speed).upgrades),
	warmupTrend: ({ minutes, strained }) => warmupTrend(minutes, strained),
	async simulate(r, {
		profile, beatmapId, chart: text, sr, rate, mods, round, board, tired,
	}) {
		const { fatigue, warmup: warm } = tired;
		const simPlay = {
			progress: (skill: SkillName7k) => skillOf(profile, skill),
			fatigue,
			warm,
			plays: await getPlays(r, profile.id, beatmapId),
		};
		const native = sim().mania7k.play;
		if (native) {
			const {
				xpScore: score, skillXp, rawXp, strainedShare, totalLength, ...played
			} = native({
				chart: text,
				play: {
					...simPlay, ...await geneInput(r, profile, beatmapId),
				},
				rate, mods, divine: false, round, strained: STRAINED_7K, gauged: r.def.gauged as SkillName7k[],
			});
			if (board) return {
				...played, skillXp: Object.fromEntries(r.def.skills.map(s => [s, 0])),
			};
			const length = totalLength / rate;
			return {
				...played,
				skillXp: await serverXp(r, profile.id, beatmapId, skillXp, {
					mindblock: MINDBLOCK_SKILLS_7K,
					modMultipliers: modXpMultipliers7k(mods),
					grade: score.grade,
					stars: sr,
					fatigue,
					genetics: await geneticsXp(r, profile, beatmapId),
				}),
				rawXp,
				strain: {
					minutes: length / 60_000,
					strained: playStrain(STRAINED_7K, { strainedShare: () => strainedShare }, length),
				},
			};
		}
		const bot = sim().mania7k.bot(simPlay);
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
				genetics: await geneticsXp(r, profile, beatmapId),
			}),
			strain: {
				minutes: length / 60_000,
				strained: playStrain(STRAINED_7K, bot, length),
			},
		};
	},
};

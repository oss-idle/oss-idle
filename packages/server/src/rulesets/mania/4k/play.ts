import '@oss-idle/shared/osu/controlPointPatch';

import type { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import { warmupTrend } from '@oss-idle/shared/fatigue';
import { type Mod } from '@oss-idle/shared/mods';
import { allowedRate } from '@oss-idle/shared/rate';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import type { ScoreLike } from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import { modXpMultipliers } from '@oss-idle/shared/rulesets/mania/4k/modXp';
import {
	MINDBLOCK_SKILLS,
	SKILL,
	type SkillName,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import type { ScoreState } from '@oss-idle/shared/rulesets/mania/scoring';
import type { SimBot } from '@oss-idle/shared/rulesets/mania/sim';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';

import { getPlays } from '../../../db/schema/beatmaps_played';
import {
	type ProfileRow,
	skillOf,
} from '../../../db/schema/character';
import { sim } from '../../../sim';
import type { RulesetPlay } from '../../play';
import type { ServerRuleset } from '../../ruleset';
import {
	serverXp,
	tiredness,
} from '../playRules';
import {
	runManiaPlay,
	strainSamples,
} from '../simulate';
import { playStrain } from '../xpRules';
import { STRAINED_4K } from './simState';

const decoder = new BeatmapDecoder();

/** The character's bot for a play of `beatmapId`: its skills at their current
 *  progress, tired, memory at its plays of the map. */
export const botFor = async (
	r: ServerRuleset,
	profile: ProfileRow,
	beatmapId: number,
	/** how tired the character is, 0 rested to 1 exhausted */
	fatigue = 0,
	/** how warmed up, 0 cold to 1 warm */
	warm = 1,
) => sim().mania4k.bot({
	progress: skill => skillOf(profile, skill),
	fatigue,
	warm,
	plays: await getPlays(r, profile.id, beatmapId),
});

/** The xp a finished play is worth: mindblock and the bonus for a first X.
 *  Exported so the score replay awards xp by the same rules a live play does,
 *  rather than keeping a second copy of them. */
export const getServerXP = async (
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
	bot: SimBot<SkillName, ScoreLike>,
	chart: Beatmap,
	score: ScoreState,
	rate = 1,
	/** the map's stars at that rate */
	stars: number,
	mods: readonly Mod[] = [],
	fatigue = 0,
) => {
	// the play's real duration: a rate shortens or stretches it
	const skillXp = bot.getSkillsXP(chart.totalLength / rate, score);
	return serverXp(r, characterId, beatmapId, skillXp, {
		mindblock: MINDBLOCK_SKILLS,
		modMultipliers: modXpMultipliers(mods),
		grade: score.grade,
		stars,
		fatigue,
	});
};

export const play: RulesetPlay = {
	tiredness: tiredness(SKILL.stamina),
	allowedRate: (profile, rate) => allowedRate(rate, skillOf(profile, 'speed').upgrades),
	warmupTrend: ({ minutes, strained }) => warmupTrend(minutes, strained),
	async simulate(r, {
		profile, beatmapId, chart: text, sr, rate, mods, round, board, tired,
	}) {
		const { fatigue, warmup: warm } = tired;
		const divine = hasUnlock(profile.generation, 'DIVINE');
		const native = sim().mania4k.play;
		if (native) {
			const {
				xpScore: score, skillXp, rawXp, strainedShare, totalLength, ...played
			} = native({
				chart: text,
				play: {
					progress: skill => skillOf(profile, skill),
					fatigue,
					warm,
					plays: await getPlays(r, profile.id, beatmapId),
				},
				rate, mods, divine, round, strained: STRAINED_4K, gauged: r.def.gauged as SkillName[],
			});
			if (board) return {
				...played, skillXp: Object.fromEntries(r.def.skills.map(s => [s, 0])),
			};
			const length = totalLength / rate;
			return {
				...played,
				skillXp: await serverXp(r, profile.id, beatmapId, skillXp, {
					mindblock: MINDBLOCK_SKILLS,
					modMultipliers: modXpMultipliers(mods),
					grade: score.grade,
					stars: sr,
					fatigue,
				}),
				rawXp,
				strain: {
					minutes: length / 60_000,
					strained: playStrain(STRAINED_4K, { strainedShare: () => strainedShare }, length),
				},
			};
		}
		const bot = await botFor(r, profile, beatmapId, fatigue, warm);
		const chart = decoder.decodeFromString(text);
		const options = {
			divine, rate, mods, playOn: round,
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
			skillXp: await getServerXP(
				r, profile.id, beatmapId, bot, chart, score, rate, sr, mods, fatigue,
			),
			rawXp: bot.getRawXP?.(length, score),
			strain: {
				minutes: length / 60_000,
				strained: playStrain(STRAINED_4K, bot, length),
			},
		};
	},
};

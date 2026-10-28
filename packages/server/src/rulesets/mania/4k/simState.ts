import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';

import {
	fatigueLevel,
	warmup,
} from '@oss-idle/shared/fatigue';
import {
	isRankedMods,
	type Mod,
} from '@oss-idle/shared/mods';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';
import { modXpMultipliers } from '@oss-idle/shared/rulesets/mania/4k/modXp';
import {
	MINDBLOCK_SKILLS,
	PHYSICAL_SKILLS,
	SKILL,
	type SkillName,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import type {
	SimPlay,
	SimPlayed,
} from '@oss-idle/shared/rulesets/mania/sim';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';
import type { UpgradeState } from '@oss-idle/shared/upgrades';

import { calculatePP } from '../../../pp';
import { sim } from '../../../sim';
import { runManiaPlay } from '../simulate';
import {
	applyXpRules,
	NO_HISTORY,
	playStrain,
} from '../xpRules';

const decoder = new BeatmapDecoder();

// Notes where no physical skill strains past its threshold add no fatigue.
// Coordination rests around 0.15-0.2 on LN maps, so it counts from higher up.
export const STRAINED_4K = {
	...Object.fromEntries(PHYSICAL_SKILLS.map(skill => [skill, 0.2])),
	coordination: 0.3,
};

export type SkillStateInput = UpgradeState & { lifetimeXp: number };

/** A character as the sim API takes it: no database behind it. */
export type SimState = {
	/** its rebirths' unlocks */
	generation: number,
	/** strained minutes: fatigue and warm-up follow, as the game works them out */
	strainMinutes: number,
	/** its plays of the map, for memory */
	mapPlays: number,
	/** a skill left out plays at level 0 with nothing on it */
	skills: Partial<Record<SkillName, SkillStateInput>>,
};

/** A play the sim API asks for: the chart by its checksum (`beatmaps.checksum`), which
 *  the sim service plays from its own copy - the text crosses only when it has none. */
export type SimInput = {
	checksum: string, state: SimState, rate: number, mods: Mod[],
	/** the map's id, for the sim cache (simService.ts) */
	beatmapId?: number,
};

/** A chart's text, or how to read it: read only when nothing kept of it will do. */
export type ChartText = string | (() => string);
const textOf = (chart: ChartText): string => typeof chart === 'string' ? chart : chart();

const NONE: SkillStateInput = {
	level: 0, xp: 0, lifetimeXp: 0, prestige: 0, upgrades: 0, overdrive: 0,
};

type Played = Pick<
	SimPlayed<SkillName>,
	'score' | 'accuracy' | 'maxCombo' | 'grade' | 'pfc' | 'counts' | 'ur' | 'failedAt' | 'failProgress' | 'failSeconds'
>;

/** The play, the xp its strain earns and the minutes it strained the physical skills for
 *  (what fatigue counts), natively when the sim plays that way. */
const playOf = (
	chart: ChartText, checksum: string, play: SimPlay<SkillName>, rate: number, mods: Mod[], divine: boolean,
): { played: Played, xp: Record<SkillName, number>, strained: number } => {
	const native = sim().mania4k.play;
	if (native) {
		const played = native({
			chart, chartId: checksum, play, rate, mods, divine,
			round: false, strained: STRAINED_4K, gauged: [], scoreOnly: true,
		});
		return {
			played,
			xp: played.skillXp,
			strained: playStrain(
				STRAINED_4K, { strainedShare: () => played.strainedShare }, played.totalLength / rate,
			),
		};
	}
	const bot = sim().mania4k.bot(play);
	const beatmap = decoder.decodeFromString(textOf(chart));
	const options = {
		divine, rate, mods, playOn: false,
	};
	const { game, played } = runManiaPlay(beatmap, bot, options, false);
	const length = beatmap.totalLength / rate;
	return {
		played,
		xp: bot.getSkillsXP(length, xpScore(beatmap, game, options)),
		strained: playStrain(STRAINED_4K, bot, length),
	};
};

/** A 4K play of `chart` by a character in `state`, as a live play would go: its score, its
 *  pp and each skill's xp (none of the character's history: medals, mindblock, a first X).
 *  Like the game, a failed or unranked-mods play earns no pp and no xp. */
export const simulateState = ({
	checksum, state, rate, mods,
}: SimInput, chart: ChartText) => {
	const skill = (name: SkillName) => state.skills[name] ?? NONE;
	const fatigue = fatigueLevel(state.strainMinutes);
	const play = {
		progress: skill,
		fatigue,
		warm: warmup(state.strainMinutes, skill(SKILL.stamina).upgrades),
		plays: state.mapPlays,
	};
	const divine = hasUnlock(state.generation, 'DIVINE');
	const { played, xp, strained } = playOf(chart, checksum, play, rate, mods, divine);
	const earns = !played.failedAt && isRankedMods(mods);
	if (earns) {
		applyXpRules(mania4k.physicalSkills, xp, {
			mindblock: MINDBLOCK_SKILLS, modMultipliers: modXpMultipliers(mods), fatigue,
		}, NO_HISTORY);
	} else {
		for (const name of Object.keys(xp) as SkillName[]) xp[name] = 0;
	}
	return {
		score: played.score,
		accuracy: played.accuracy,
		maxCombo: played.maxCombo,
		grade: played.grade,
		pfc: played.pfc,
		counts: played.counts,
		ur: played.ur,
		passed: !played.failedAt,
		...played.failProgress !== undefined && {
			failProgress: played.failProgress, failSeconds: played.failSeconds,
		},
		pp: earns ? calculatePP(mania4k, played, chart, rate, mods, checksum) : 0,
		xp,
		strainedMinutes: strained,
	};
};

export type SimResult = ReturnType<typeof simulateState>;

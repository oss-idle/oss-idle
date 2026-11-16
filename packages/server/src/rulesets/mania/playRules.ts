import type { Big } from '@oss-idle/shared/big';
import {
	fatigueLevel,
	restedFatigue,
	warmup,
	warmupBar,
} from '@oss-idle/shared/fatigue';
import {
	fatigueGenes,
	type GeneticsDef,
} from '@oss-idle/shared/genetics';
import {
	compareGradeGT,
	compareGradeGTE,
	GRADE,
	type Grade,
} from '@oss-idle/shared/grade';
import { skillXPMultiplier } from '@oss-idle/shared/upgrades';

import {
	geneticsOf,
	type ProfileRow,
	skillOf,
} from '../../db/schema/character';
import { bestGradeOn } from '../../db/schema/score';
import { medalMultiplier } from '../../medals';
import {
	mindblockFactor,
	recentMapPlays,
} from '../../mindblock';
import type { Tiredness } from '../play';
import type { ServerRuleset } from '../ruleset';
import {
	applyXpRules,
	type XpRules,
} from './xpRules';

/** How tired and warmed up the character plays right now: warm-up gear warms it faster. */
export const tiredness = (
	warmupSkill: string,
	genetics?: GeneticsDef,
) => (profile: ProfileRow): Tiredness => {
	const genes = fatigueGenes(genetics, geneticsOf(profile));
	const { upgrades } = skillOf(profile, warmupSkill);
	const tired = restedFatigue(profile.fatigue ?? undefined, Date.now(), genes, upgrades);
	return {
		fatigue: fatigueLevel(tired),
		warmup: warmup(tired, upgrades, genes),
		warmupBar: warmupBar(tired, upgrades, genes),
	};
};

/** The xp a finished play is worth to `profile`: its own multipliers, its history (mindblock,
 *  medals, a first X) read from the database, then {@link applyXpRules} on the bot's raw xp. */
export const serverXp = async <S extends string>(
	r: ServerRuleset,
	profile: ProfileRow,
	beatmapId: number,
	raw: Record<S, number>,
	{
		grade, stars, genetics, xpMultiplier = 1, ...rules
	}: XpRules<S> & {
		grade: Grade,
		/** the map's stars at the play's rate */
		stars: number,
		genetics?: Readonly<Record<string, number>>,
		/** debug xp scaling (dev): only ever raises it */
		xpMultiplier?: number,
	},
): Promise<Record<S, Big>> => {
	const topGrade = await bestGradeOn(r, profile.id, beatmapId);
	const firstX = compareGradeGTE(grade, GRADE.X) && (!topGrade || compareGradeGT(grade, topGrade));
	const own = (skill: S) => {
		const { upgrades, overdrive, prestige } = skillOf(profile, skill);
		return skillXPMultiplier(upgrades, overdrive, prestige).mul(Math.max(1, xpMultiplier));
	};
	return applyXpRules(r.def.physicalSkills as S[], raw, own, rules, {
		// read from the persisted history, before this play is stored
		mindblock: mindblockFactor(await recentMapPlays(r, profile.id, beatmapId)),
		medals: await medalMultiplier(r, profile.id),
		firstX: firstX ? Math.floor(1000 * stars) : 0,
		genetics,
	});
};

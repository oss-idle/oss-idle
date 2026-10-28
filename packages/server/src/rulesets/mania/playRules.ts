import {
	fatigueLevel,
	restedFatigue,
	warmup,
	warmupBar,
} from '@oss-idle/shared/fatigue';
import {
	compareGradeGT,
	compareGradeGTE,
	GRADE,
	type Grade,
} from '@oss-idle/shared/grade';

import {
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
export const tiredness = (warmupSkill: string) => (profile: ProfileRow): Tiredness => {
	const tired = restedFatigue(profile.fatigue ?? undefined, Date.now());
	const { upgrades } = skillOf(profile, warmupSkill);
	return {
		fatigue: fatigueLevel(tired),
		warmup: warmup(tired, upgrades),
		warmupBar: warmupBar(tired, upgrades),
	};
};

/** The xp a finished play is worth to `characterId`: its history (mindblock, medals, a
 *  first X) read from the database, then {@link applyXpRules}, on the bot's `skillXp` in place. */
export const serverXp = async <S extends string>(
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
	skillXp: Record<S, number>,
	{
		grade, stars, ...rules
	}: XpRules<S> & {
		grade: Grade,
		/** the map's stars at the play's rate */
		stars: number,
	},
): Promise<Record<S, number>> => {
	const topGrade = await bestGradeOn(r, characterId, beatmapId);
	const firstX = compareGradeGTE(grade, GRADE.X) && (!topGrade || compareGradeGT(grade, topGrade));
	return applyXpRules(r.def.physicalSkills as S[], skillXp, rules, {
		// read from the persisted history, before this play is stored
		mindblock: mindblockFactor(await recentMapPlays(r, characterId, beatmapId)),
		medals: await medalMultiplier(r, characterId),
		firstX: firstX ? Math.floor(1000 * stars) : 0,
	});
};

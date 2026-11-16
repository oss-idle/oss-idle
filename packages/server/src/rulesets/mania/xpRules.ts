import type { Big } from '@oss-idle/shared/big';
import { fatigueXp } from '@oss-idle/shared/fatigue';
import { scaleXp } from '@oss-idle/shared/xpGain';

/** What moves a mania play's xp on the server, on top of the bot's split. */
export type XpRules<S extends string> = {
	/** the skills replaying a map recently dulls */
	mindblock: readonly S[],
	modMultipliers: Record<S, number>,
	fatigue: number,
};

/** What the character's history does to a play's xp. */
export type XpHistory = {
	/** how much replaying the map lately dulls the mindblock skills, 1 for not at all */
	mindblock: number,
	/** the medals' bonus */
	medals: number,
	/** accuracy's bonus for a first X on the map */
	firstX: number,
	/** each skill's multiplier from the character's genetics */
	genetics?: Readonly<Record<string, number>>,
};

/** A character state with no history: the sim API's. */
export const NO_HISTORY: XpHistory = {
	mindblock: 1, medals: 1, firstX: 0,
};

/** The xp a finished play is worth: the bot's raw xp times the character's own `multiplier`,
 *  mindblock, fatigue, medals, genetics and mods, floored once; then a first X's bonus, modded. */
export const applyXpRules = <S extends string>(
	physical: readonly S[],
	raw: Record<S, number>,
	multiplier: (skill: S) => Big,
	{
		mindblock, modMultipliers, fatigue,
	}: XpRules<S>,
	history: XpHistory,
): Record<S, Big> => {
	const tired = fatigueXp(fatigue);
	const xp = scaleXp(raw, skill => multiplier(skill).mul(
		(physical.includes(skill) ? tired : 1)
		* (history.mindblock < 1 && mindblock.includes(skill) ? history.mindblock : 1)
		* history.medals
		* (history.genetics?.[skill] ?? 1)
		* modMultipliers[skill],
	));
	const accuracy = 'accuracy' as S;
	if (history.firstX) {
		xp[accuracy] = xp[accuracy].add(Math.floor(history.firstX * modMultipliers[accuracy]));
	}
	return xp;
};

// The heaviest maps strain the physical skills on about this share of their notes.
const FULL_STRAIN_SHARE = 0.4;

/** Each physical skill's strain past which a note adds fatigue. */
export type StrainThresholds = Readonly<Record<string, number>>;

type Strained = { strainedShare(thresholds: StrainThresholds): number };

/** Minutes of a play the physical skills were strained for. */
export const playStrain = (thresholds: StrainThresholds, bot: Strained, lengthMs: number) => {
	const share = bot.strainedShare(thresholds) / FULL_STRAIN_SHARE;
	return Math.min(1, share) * lengthMs / 60_000;
};

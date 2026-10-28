import { fatigueXp } from '@oss-idle/shared/fatigue';

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
};

/** A character state with no history: the sim API's. */
export const NO_HISTORY: XpHistory = {
	mindblock: 1, medals: 1, firstX: 0,
};

/** The xp a finished play is worth: mindblock, fatigue, medals, the bonus for a first X
 *  and mods, applied to the bot's `skillXp` in place. */
export const applyXpRules = <S extends string>(
	physical: readonly S[],
	skillXp: Record<S, number>,
	{
		mindblock, modMultipliers, fatigue,
	}: XpRules<S>,
	history: XpHistory,
): Record<S, number> => {
	const scale = (names: readonly S[], factor: number) => {
		for (const name of names) skillXp[name] = Math.floor(skillXp[name] * factor);
	};
	if (history.mindblock < 1) scale(mindblock, history.mindblock);
	scale(physical, fatigueXp(fatigue));
	scale(Object.keys(skillXp) as S[], history.medals);
	if (history.firstX) skillXp['accuracy' as S] += history.firstX;
	for (const name of Object.keys(skillXp) as S[]) {
		skillXp[name] = Math.floor(skillXp[name] * modMultipliers[name]);
	}
	return skillXp;
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

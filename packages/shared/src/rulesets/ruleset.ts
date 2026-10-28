import type { MedalCatalogue } from '../achievements/catalogue.js';
import type { Mod } from '../mods.js';
import type { RulesetId } from './ids.js';

/** What pp reads off a play: a live score, or a stored one. */
export type PerformanceScore = {
	score: number,
	accuracy: number,
	maxCombo: number,
	counts: Readonly<Record<string, number>>,
};

/** What code outside a ruleset may know of it. Its functions are methods so a
 *  ruleset's own narrow types still read as the generic ones. */
export type RulesetDef<J extends string = string, S extends string = string> = {
	id: RulesetId,
	/** best first: they name its score and totals columns */
	judgements: readonly J[],
	/** the judgement that is not a hit */
	miss: J,
	/** in display order: they name its character columns */
	skills: readonly S[],
	/** the accuracy of a play or of a player's totals, from its judgement counts */
	accuracyOf(counts: Readonly<Record<J, number>>): number,
	/** the player-facing, localized name of one of its skills, or of 'overall' */
	skillName(skill: S | 'overall'): string,
	/** what one of its skills does in a play, localized */
	skillDescription(skill: S): string,
	/** what a skill's upgrade line is, localized */
	upgradeDescription(skill: S): string,
	/** the localized gear name of a skill's upgrade at `level` */
	upgradeLabel(skill: S, level: number): string,
	/** what each skill's xp is multiplied by under `mods` */
	modXpMultipliers(mods: readonly Mod[]): Record<S, number>,
	/** what prestiging a skill costs beyond its levels, localized, when it costs more */
	prestigeNote(skill: S): string | undefined,
	/** the note under its skills list: what else moves a play's xp, localized */
	skillsNote(): string,
	/** the skills fatigue and warm-up act on */
	physicalSkills: readonly S[],
	/** the skills the strain gauges show during a play, top to bottom */
	gauged: readonly S[],
	/** the skill whose gear unlocks rates, and the one whose gear warms up faster */
	rateSkill?: S,
	warmupSkill?: S,
	/** a character can be reborn in it (4K alone: 7K and standard have no rebirth) */
	rebirth?: true,
	/** its medals: they are earned, held and ranked in this ruleset alone */
	medals: MedalCatalogue,
	/** rosu-pp's `Performance` arguments for a play (rosu reads the mode off the chart) */
	performanceArgs(score: PerformanceScore, rate?: number, mods?: readonly Mod[]): object,
};

/** A row's judgement counts, from a type that can't name its ruleset's judgement columns. */
export const countsOf = (row: object): Readonly<Record<string, number>> =>
	row as Record<string, number>;

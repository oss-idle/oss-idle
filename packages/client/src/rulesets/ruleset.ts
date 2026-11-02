import type { Beatmap } from 'osu-classes';

import type { GlyphName } from '@oss-idle/shared/achievements/glyphs';
import type { Mod } from '@oss-idle/shared/mods';
import type { SkillGain } from '@oss-idle/shared/play';
import type { Bot } from '@oss-idle/shared/rulesets/mania/bot';
import type { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';
import type SkillState from '@oss-idle/shared/rulesets/skillState';

import type Character from '../db/schema/character';
import type { Tiredness } from '../online/localPlay';

/** What spending on a skill does to the local character beyond the shared math. */
export type ClientProgression = {
	afterUpgrade(character: Character, skill: string): void,
	afterPrestige(character: Character, skill: string): void,
};

/** A finished local play, as its bot reads what it earned. */
export type FinishedPlay = {
	chart: Beatmap,
	game: ManiaGame,
	/** the map's length at the play's rate, ms */
	length: number,
	rate: number,
	mods: Mod[],
	divine: boolean,
	/** the debug xp scaling */
	multiplier: number,
	/** each skill's xp scaling from the character's genetics */
	genetics?: Readonly<Record<string, number>>,
};

/** The bot a character plays a map with: its strain feeds the HUD, its play pays out. */
export type PlayBot = Bot & {
	strainsAt(now: number): Readonly<Record<string, number>>,
	gains(play: FinishedPlay): SkillGain[],
};

/** How a mania ruleset plays on this device. Loaded when a play needs it: it carries
 *  the ruleset's skills and their strain. */
export type ManiaPlayer = {
	/** a bot playing with a copy of `skills` (the live ones never move mid-play) */
	bot(skills: readonly SkillState[], timesPlayed: number, tired?: Tiredness): PlayBot,
	/** a fixed-level bot for the skin preview */
	debugBot(): PlayBot,
	/** the strain gauges, top to bottom, in the active locale */
	strainGauges(): { skill: string, label: string }[],
};

/** A gene's name, and what it does at `n` (its tier times its tree's strength). */
export type GeneText = { name: () => string, does: (n: number) => string };

export type QuizAnswer = {
	skill: string,
	text: () => string,
	/** why it points there, said back on the result */
	because: () => string,
};
export type QuizQuestion = { ask: () => string, answers: QuizAnswer[] };

/** What a ruleset shows of its genetics, in its own words: each ruleset's trees differ. */
export type ClientGenetics = {
	genes: Record<string, GeneText>,
	/** everyday questions, each answer pointing at a skill */
	quiz: QuizQuestion[],
	/** each skill in a few plain words */
	pitch: Record<string, () => string>,
	glyph: Record<string, GlyphName>,
};

/** A ruleset on the client: its def, and what it does here beyond it. */
export type ClientRuleset = {
	def: RulesetDef,
	progression?: ClientProgression,
	genetics?: ClientGenetics,
	/** its local play, when this device plays it */
	player?: () => Promise<ManiaPlayer>,
};

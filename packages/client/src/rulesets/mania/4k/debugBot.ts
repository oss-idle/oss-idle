import { warmupCurve } from '@oss-idle/shared/fatigue';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	SKILL,
	type SkillName,
} from '@oss-idle/shared/rulesets/mania/4k/skills';

import type Character from '../../../db/schema/character';

/** What a real play takes from the character and its state, set by hand for
 *  the debug bot (the strain view and its debug play). */
export type DebugBot = {
	levels: Record<SkillName, number>,
	/** a level set by hand drops its skill's prestige: the level is the level */
	prestige?: Partial<Record<SkillName, number>>,
	/** memory's tries on the map */
	timesPlayed: number,
	/** strained minutes, which the warm-up and fatigue follow */
	fatigueMinutes: number,
};

const KEY = 'debug-bot';

const stored = (): DebugBot | undefined => {
	try {
		const value = localStorage.getItem(KEY);
		return value ? JSON.parse(value) as DebugBot : undefined;
	} catch {
		return undefined;
	}
};

/** The knobs as last set, kept across reloads; none set follows the character. */
export const debugBot = new Synced<DebugBot | undefined>(stored());
void debugBot.sync(value => {
	try {
		if (value) localStorage.setItem(KEY, JSON.stringify(value));
		else localStorage.removeItem(KEY);
	} catch {
		// storage off: the knobs last until the reload
	}
});

export const staminaGear = (character: Character): number =>
	character.skills.find(s => s.name === SKILL.stamina)?.upgrades.get() ?? 0;

/** The character's own levels, warmed up and rested: what the debug bot used to
 *  play before it had knobs. */
export const fromCharacter = (character: Character): DebugBot => ({
	levels: Object.fromEntries(
		character.skills.map(s => [s.name, s.level.get()]),
	) as DebugBot['levels'],
	prestige: Object.fromEntries(character.skills.map(s => [s.name, s.prestige.get()])),
	timesPlayed: 0,
	fatigueMinutes: warmupCurve(staminaGear(character)).warm,
});

/** A skill's prestige in `bot`, the character's where the bot has none. */
export const prestigeOf = (character: Character, bot: DebugBot, skill: SkillName): number =>
	bot.prestige?.[skill] ?? character.skills.find(s => s.name === skill)?.prestige.get() ?? 0;

/** `bot` with `levels` set by hand: their skills lose their prestige. */
export const withLevels = (
	bot: DebugBot,
	levels: Partial<Record<SkillName, number>>,
): DebugBot => ({
	...bot,
	levels: {
		...bot.levels, ...levels, 
	},
	prestige: {
		...bot.prestige, ...Object.fromEntries(Object.keys(levels).map(skill => [skill, 0])), 
	},
});

export const debugBotOf = (character: Character): DebugBot =>
	debugBot.get() ?? fromCharacter(character);

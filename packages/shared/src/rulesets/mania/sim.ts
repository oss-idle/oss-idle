import type { Beatmap } from 'osu-classes';

import type { Grade } from '../../grade.js';
import type { Mod } from '../../mods.js';
import type { StrainSamples } from '../../play.js';
import type { UpgradeState } from '../../upgrades.js';
import type { ScoreLike } from './4k/bots/character.js';
import type { SkillName } from './4k/skills.js';
import type { ScoreLike7k } from './7k/bots/character.js';
import type { SkillName7k } from './7k/skills.js';
import type { DebugAnalysis } from './analysis.js';
import type { Bot } from './bot.js';
import type { Judgement } from './judgement.js';
import type {
	ManiaGameOptions,
	ReplayOffset,
} from './maniaGame.js';

/** A play's bot as the server reads it once the play is over. */
export interface SimBot<S extends string, Score> extends Bot {
	getSkillsXP(length: number, score: Score): Record<S, number>;
	/** {@link getSkillsXP} before the character's own multipliers: the same for anyone at that level. */
	getRawXP?(length: number, score: Score): Record<S, number>;
	/** The share of the play's notes on which any skill in `thresholds` strained past its threshold. */
	strainedShare(thresholds: Partial<Record<S, number>>): number;
	/** each skill's strain at song time `t`, 0-1 above its resting baseline: what the gauges show */
	strainsAt(t: number): Readonly<Record<string, number>>;
}

/** What a play is simulated from. */
export type SimPlay<S extends string> = {
	/** each skill's progress, and all the xp it ever earned */
	progress: (skill: S) => UpgradeState & { lifetimeXp: number },
	/** how tired, 0 rested to 1 exhausted */
	fatigue: number,
	/** how warmed up, 0 cold to 1 warm */
	warm: number,
	/** the character's plays of the map, for memory */
	plays: number,
};

/** What a whole play is simulated from ({@link ManiaSim.play}). */
export type SimPlayInput<S extends string> = {
	/** the chart's `.osu` text, or how to read it: a sim that holds the chart
	 *  already (by `chartId`) never reads it */
	chart: string | (() => string),
	/** a stable id of the chart's text (its checksum): the sim keys what it keeps
	 *  of the chart on it instead of on the text */
	chartId?: string,
	/** the chart decoded, when the caller has it already: spares a decode when the
	 *  sim has not seen the chart yet */
	beatmap?: Beatmap,
	play: SimPlay<S>,
	rate: number,
	mods: readonly Mod[],
	divine: boolean,
	/** a match round: a fail plays on to the end */
	round: boolean,
	/** the thresholds `strainedShare` is asked for (the fatigue rule's) */
	strained: Partial<Record<S, number>>,
	/** the skills the strain gauges show (`strainSamples`) */
	gauged: readonly S[],
	/** only the score, pp's inputs and the xp (the sim API): the replay, its
	 *  reveals, the samples and the gauges come back empty */
	scoreOnly?: boolean,
};

/** A whole play: everything the server reads of it - what `runManiaPlay`,
 *  `strainSamples`, `xpScore` and the bot give it for a play of the same chart. */
export type SimPlayed<S extends string> = {
	/** rounded, as runManiaPlay keeps it */
	score: number,
	accuracy: number,
	maxCombo: number,
	grade: Grade,
	ur: number,
	pfc: boolean,
	counts: Record<Judgement, number>,
	/** [song time, accuracy, grade, score, combo, failed] every 250 ms */
	samples: [number, number, Grade, number?, number?, boolean?][],
	/** the replay in reveal order, and when each offset may be revealed */
	offsets: ReplayOffset[],
	reveals: number[],
	songStartMs: number,
	lastNoteEnd: number,
	endSongTime: number,
	failedAt?: number,
	failProgress?: number,
	failSeconds?: number,
	strains: StrainSamples,
	/** the score xp reads (`xpScore`: the play judged at the map's own windows) */
	xpScore: { accuracy: number, MISS: number, grade: Grade },
	/** the bot's xp for that score over `totalLength / rate`: getSkillsXP, getRawXP */
	skillXp: Record<S, number>,
	rawXp: Record<S, number>,
	/** `strainedShare` of the input's thresholds */
	strainedShare: number,
	/** the chart's `totalLength` (ms, at x1) */
	totalLength: number,
};

/** A ruleset's play simulation. The public one is the game's own; the main server
 *  loads a private one with the same shape (`server/src/sim.ts`). */
export type ManiaSim<S extends string, Score> = {
	bot(play: SimPlay<S>): SimBot<S, Score>,
	/** the strain view's analysis (dev only): every skill alone over the map, then combined */
	analyze?(
		play: SimPlay<S>,
		beatmap: Beatmap,
		options: Pick<ManiaGameOptions, 'rate' | 'mods' | 'divine'>,
	): DebugAnalysis,
	/** A whole play in one call, for a sim that plays it natively: the server
	 *  takes it over `bot` + runManiaPlay when the sim has it. */
	play?(input: SimPlayInput<S>): SimPlayed<S>,
};

export type Sims = {
	mania4k: ManiaSim<SkillName, ScoreLike>,
	mania7k: ManiaSim<SkillName7k, ScoreLike7k>,
};

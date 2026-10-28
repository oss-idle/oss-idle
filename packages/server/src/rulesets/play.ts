import type { Grade } from '@oss-idle/shared/grade';
import type { Mod } from '@oss-idle/shared/mods';
import type { StrainSamples } from '@oss-idle/shared/play';

import type {
	CharacterRow,
	ProfileRow,
} from '../db/schema/character';
import type { ServerRuleset } from './ruleset';

/** [song time, accuracy, grade, score, combo, failed] - a failed play's score
 *  and combo stay where they were when it failed. */
export type PlaySample = [number, number, Grade, number?, number?, boolean?];

/** How tired and warmed up a character plays: 0 rested to 1 exhausted, 0 cold to 1 warm. */
export type Tiredness = { fatigue: number, warmup: number, warmupBar: number };

export type PlayInput = {
	character: CharacterRow,
	profile: ProfileRow,
	beatmapId: number,
	/** the `.osu` text and its stars at x1 */
	chart: string,
	sr: number,
	rate: number,
	mods: Mod[],
	/** a match round: a fail plays on to the end */
	round: boolean,
	/** onto an unranked map's leaderboard: no xp */
	board: boolean,
	tired: Tiredness,
};

/** A simulated play, everything the server stores and streams of it. */
export type Simulated = {
	score: number,
	accuracy: number,
	maxCombo: number,
	grade: Grade,
	ur: number,
	pfc: boolean,
	counts: Record<string, number>,
	samples: PlaySample[],
	/** the replay the client plays back, in reveal order; only its ruleset reads it */
	offsets: unknown[],
	/** song time each offset may be revealed at */
	reveals: number[],
	songStartMs: number,
	/** the map's last note: every viewer is told the play ends there */
	lastNoteEnd: number,
	/** where the play really ends (its fail, unless it plays on) */
	endSongTime: number,
	/** 1-based judgement index the play failed at */
	failedAt?: number,
	failProgress?: number,
	failSeconds?: number,
	/** per-skill xp, mods applied, before any debug scaling */
	skillXp: Record<string, number>,
	/** per-skill xp the play's strain is worth before anything multiplies it */
	rawXp?: Record<string, number>,
	/** the strain gauges over the play, streamed with its offsets */
	strains?: StrainSamples,
	/** the play's minutes and those its physical skills were strained, for fatigue */
	strain?: { minutes: number, strained: number },
};

/** How a ruleset plays on the server. */
export type RulesetPlay = {
	tiredness(profile: ProfileRow): Tiredness,
	/** the playback rate asked for, held to what the profile unlocks */
	allowedRate(profile: ProfileRow, rate: number): number,
	simulate(r: ServerRuleset, input: PlayInput): Promise<Simulated>,
	/** which way a play moves the warm-up bar, -3 cooling to 3 warming */
	warmupTrend(strain: { minutes: number, strained: number }): number,
};

/** What a ruleset's skills do on top of the shared upgrade and prestige math. */
export type RulesetProgression = {
	afterUpgrade?(r: ServerRuleset, characterId: number, skill: string): Promise<unknown>,
	afterPrestige?(r: ServerRuleset, characterId: number, skill: string): Promise<unknown>,
};

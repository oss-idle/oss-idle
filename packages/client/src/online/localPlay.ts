import { Beatmap } from 'osu-classes';

import type { Grade } from '@oss-idle/shared/grade';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	isRankedMods,
	type Mod,
} from '@oss-idle/shared/mods';
import type { SkillGain } from '@oss-idle/shared/play';
import { LEAD_IN_MS } from '@oss-idle/shared/play';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import type {
	ManiaGame,
	ReplayOffset,
} from '@oss-idle/shared/rulesets/mania/maniaGame';

import Character from '../db/schema/character';
import { MemoryFail } from '../db/schema/memory_fail';
import { Score } from '../db/schema/score';
import { ScoreXP } from '../db/schema/score_xp';
import { selectedMods } from '../gameplay/playMods';
import { rateFor } from '../gameplay/playRate';
import { debugXpMultiplier } from '../globals';
import { logPlayFinished } from '../logs';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import {
	chartDef,
	loadPlayer,
} from '../rulesets/registry';
import type { PlayBot } from '../rulesets/ruleset';
import Socket from './socket';

/** Song-time gap between the accuracy/grade checkpoints the dock reads. */
const SAMPLE_STEP_MS = 5000;

/** How long a finished local play stays readable, so a scene that arrives late
 *  still gets its result. */
const RESULT_TTL_MS = 10 * 60 * 1000;

export type LocalScoring = 'guest' | 'unranked';

/** How tired and warmed up the server says the character plays right now. */
export type Tiredness = { fatigue: number, warmup: number, warmupBar?: number };

export type LocalStart = { mode: LocalScoring, tired?: Tiredness };

/** The client-side twin of the server's pending play. Everything about the play
 *  is decided here, when it starts. */
type LocalRun = {
	token: string;
	mode: LocalScoring;
	/** the character this play was started for. A guest rebirth mid-play swaps
	 *  the live one, and the play belongs to the one that earned it. */
	character: Character;
	beatmap: LightBeatmap;
	/** the playback rate it was simulated at */
	rate: number;
	mods: Mod[];
	beatmapId: number;
	chart: Beatmap;
	/** the resolved simulation - the play, in full, before a note is drawn */
	game: ManiaGame;
	/** the analysis that produced it, so the strain HUD shows the play being
	 *  watched rather than a second, different one */
	bot: PlayBot;
	tired?: Tiredness;
	offsets: ReplayOffset[];
	startedAt: number;
	endsAt: number;
	songStartMs: number;
	/** how far into the map the play got, 0-1: what a fail trains memory by */
	reached: number;
	samples: [number, number, Grade][];
	timer: number;
};

export type LocalPlayState = {
	phase: 'active';
	token: string;
	beatmapId: number;
	startedAt: number;
	endsAt: number;
	accuracy: number;
	grade: Grade;
} | {
	phase: 'finished';
	token: string;
	beatmapId: number;
	failed: boolean;
};

export type LocalResult = {
	token: string;
	beatmap: LightBeatmap;
	failed: boolean;
	score?: Score;
	gains?: SkillGain[];
};

/**
 * A play the client owns, run the way the server runs a ranked one.
 *
 * The map is simulated in full the moment it starts, and the outcome is stored;
 * what remains is a clock. That is what lets a guest or an unranked play keep
 * running while the player is in song select, on the character page, or nowhere
 * near a playfield - and it makes "the outcome is decided at start" true of
 * every play, which is what the deferred purchases rely on.
 *
 * The gameplay scene is a viewer over it, replaying the same offsets a ranked
 * play replays.
 */
export const localPlayState = new Synced<LocalPlayState | undefined>(undefined);

let current: LocalRun | undefined;
let result: { at: number, value: LocalResult } | undefined;
/** A start in flight, so a second caller for the same map joins it rather than
 *  racing it. The guard below spans two awaits, which is long enough for the
 *  gameplay scene and a background chain to both get through. */
let starting: { beatmapId: number, run: Promise<LocalRun> } | undefined;

export const currentLocalPlay = (): LocalRun | undefined => current;


/** Where the play has got to, in song time. */
const positionOf = (run: LocalRun): number => Date.now() - run.startedAt - LEAD_IN_MS;

const sampleAt = (run: LocalRun, at: number): [number, Grade] => {
	let acc = 1;
	let grade: Grade = 'X';
	for (const [t, a, g] of run.samples) {
		if (t > at) break;
		acc = a;
		grade = g;
	}
	return [acc, grade];
};

const publish = (run: LocalRun): void => {
	const [accuracy, grade] = sampleAt(run, positionOf(run));
	void localPlayState.set({
		phase: 'active',
		token: run.token,
		beatmapId: run.beatmapId,
		startedAt: run.startedAt,
		endsAt: run.endsAt,
		accuracy,
		grade,
	});
};

/**
 * Start (or join) the local play for a difficulty. Joining matters for the same
 * reason it does server-side: a second scene mounting must watch the play that
 * is running, not start a rival one.
 */
export const startLocalPlay = async (
	character: Character,
	beatmap: LightBeatmap,
	chart: Beatmap,
	{ mode, tired }: LocalStart,
): Promise<LocalRun> => {
	const beatmapId = chart.metadata.beatmapId;
	if (current && current.beatmapId === beatmapId) return current;
	if (starting?.beatmapId === beatmapId) return starting.run;

	const run = simulate(character, beatmap, chart, mode, beatmapId, tired);
	starting = {
		beatmapId, run,
	};
	try {
		return await run;
	} finally {
		if (starting?.run === run) starting = undefined;
	}
};

const simulate = async (
	character: Character,
	beatmap: LightBeatmap,
	chart: Beatmap,
	mode: LocalScoring,
	beatmapId: number,
	tired?: Tiredness,
): Promise<LocalRun> => {
	const timesPlayed = await Score.countPlays(
		character.id,
		beatmapId,
		character.progress.memoryResetAt,
		character.memoryForgets(),
	);

	const rate = rateFor(character, beatmap.lockedRate);
	const mods = beatmap.lockedMods ?? selectedMods.get();
	const options = {
		divine: hasUnlock(character.generation, 'DIVINE'), rate, mods,
	};
	// the bot holds a copy of the skills: the live ones read again at finalise would
	// pay a purchase made mid-play out on this play (the server copies them too)
	const player = await loadPlayer(beatmap.metadata.mode, beatmap.metadata.keys);
	if (!player) throw new Error(`no local play for ${beatmap.metadata.mode}/${beatmap.metadata.keys}`);
	const bot = player.bot(character.skills, timesPlayed, tired);
	const { ManiaGame } = await import('@oss-idle/shared/rulesets/mania/maniaGame');
	const game = new ManiaGame(chart, bot, options);

	// walk to the end in steps, checkpointing accuracy and grade on the way -
	// the dock reads these back while the play runs
	const samples: [number, number, Grade][] = [];
	for (let t = 0; t <= game.songEndMs; t += SAMPLE_STEP_MS) {
		game.update(t);
		samples.push([t, game.score.accuracy, game.score.grade]);
	}
	game.update(game.songEndMs + 1000);

	const failedAt = game.score.failed ? game.score.failedIndex : undefined;
	const lastNoteEnd = game.notes.reduce(
		(m, n) => Math.max(m, n.hold ? n.endTime : n.time), 0,
	);
	const endSongTime = failedAt ? game.hits[failedAt - 1].time : lastNoteEnd;
	const startedAt = Date.now();

	const run: LocalRun = {
		token: `local-${startedAt}-${beatmapId}`,
		mode,
		character,
		beatmap,
		beatmapId,
		rate,
		mods,
		chart,
		game,
		bot,
		tired,
		offsets: game.replayOffsets(),
		startedAt,
		endsAt: startedAt + LEAD_IN_MS + endSongTime,
		songStartMs: game.songStartMs,
		reached: Math.min(1, endSongTime / lastNoteEnd),
		samples,
		timer: 0,
	};
	// Replaced only once the new one is ready: dropping the old play first leaves
	// a moment with no local state, which reads as a play ending - the manager
	// would start a countdown for the queue's next map against this one booting.
	if (current) abortLocalPlay(current.token);
	current = run;
	// the server's queue waits for it (no socket for a guest: nothing sent)
	Socket.send({
		type: 'queue:localStart', ms: Math.max(0, Math.round(run.endsAt - Date.now())),
	});
	run.timer = window.setTimeout(
		() => void finalizeLocalPlay(run.token),
		Math.max(0, run.endsAt - Date.now()),
	);
	publish(run);
	return run;
};

/** Refresh the live checkpoint the dock shows. */
export const pollLocalPlay = (): void => {
	if (current) publish(current);
};

/** Pull the timeline in so the play ends now - the local twin of asking the
 *  server to finish. Used by the skip, which already holds the whole replay. */
export const finishLocalPlay = (token: string): void => {
	if (!current || current.token !== token) return;
	window.clearTimeout(current.timer);
	void finalizeLocalPlay(token);
	Socket.send({ type: 'queue:localEnd' });
};

export const abortLocalPlay = (token: string): void => {
	if (!current || current.token !== token) return;
	window.clearTimeout(current.timer);
	current = undefined;
	if (localPlayState.get()) void localPlayState.set(undefined);
	Socket.send({ type: 'queue:localEnd' });
};

/**
 * Close the play out: build its score, save it, award what it earned. The one
 * place a local play's result is decided, whether or not a scene watched it -
 * two owners would mean two payouts.
 */
export const finalizeLocalPlay = async (token: string): Promise<void> => {
	const run = current;
	if (!run || run.token !== token) return;
	current = undefined;
	window.clearTimeout(run.timer);

	const character = run.character;
	const game = run.game;
	const failed = game.score.failed;

	const { default: calculatePP } = await import('../osu/pp');
	const def = chartDef(run.beatmap.metadata.mode, run.beatmap.metadata.keys);
	const pp = await calculatePP(def, game.score, run.chart, run.rate, run.mods).catch(() => 0);
	const c = game.score.counts;
	const score = new Score({
		characterId: Number(character.id),
		beatmapId: run.beatmapId,
		score: Math.round(game.score.score),
		accuracy: game.score.accuracy,
		maxCombo: game.score.maxCombo,
		...c,
		grade: game.score.grade,
		pp,
		ur: game.unstableRate(),
		pfc: c.MISS === 0 && c.BAD === 0 && c.GOOD === 0,
		playedAt: Date.now(),
		rate: run.rate,
		mods: run.mods,
	});

	let saved = score;
	let gains: SkillGain[] | undefined;
	// a failed play is never saved or paid for, only remembered up to where it got;
	// an unranked one is saved but earns nothing, the same rules the scene used to apply
	if (failed) {
		void MemoryFail.record(Number(character.id), run.beatmapId, run.reached);
	} else {
		saved = await score.add().catch(() => score);
		if (run.mode === 'guest' && isRankedMods(run.mods)) {
			gains = run.bot.gains({
				chart: run.chart,
				game,
				length: run.beatmap.metadata.total_length / run.rate,
				rate: run.rate,
				mods: run.mods,
				divine: hasUnlock(character.generation, 'DIVINE'),
				multiplier: debugXpMultiplier.get(),
			});
			// the bot earned it on its own copy of the skills, so hand the gains to
			// the live ones - which may have moved since the play started
			for (const gain of gains) {
				character.skills.find(s => s.name === gain.skill)?.gainXP(gain.gained);
			}
			void character.addProgression(gains);
			void ScoreXP.record(saved, gains);
		}
		logPlayFinished(saved, run.beatmap, gains);
	}

	result = {
		at: Date.now(),
		value: {
			token,
			beatmap: run.beatmap,
			failed,
			score: failed ? undefined : saved,
			gains,
		},
	};
	void localPlayState.set({
		phase: 'finished', token, beatmapId: run.beatmapId, failed,
	});
};

/** The finished play's result, once it has one. Mirrors the server's result
 *  read: a scene asks, and waits if the play is still running. */
export const localPlayResult = (token: string): LocalResult | undefined => {
	if (!result || result.value.token !== token) return undefined;
	if (Date.now() - result.at > RESULT_TTL_MS) {
		result = undefined;
		return undefined;
	}
	return result.value;
};

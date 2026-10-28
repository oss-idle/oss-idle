import type { Beatmap } from 'osu-classes';

import { countsForMedals } from '@oss-idle/shared/mods';
import {
	STRAIN_EVERY_MS,
	type StrainSamples,
} from '@oss-idle/shared/play';
import type { Bot } from '@oss-idle/shared/rulesets/mania/bot';
import {
	ManiaGame,
	type ManiaGameOptions,
	type ReplayOffset,
	unstableRate,
} from '@oss-idle/shared/rulesets/mania/maniaGame';

import type {
	PlaySample,
	Simulated,
} from '../play';

/** Song-time gap between the checkpoints kept for the live poll and the
 *  multiplayer scoreboard. */
const SAMPLE_STEP_MS = 250;

/** The strain gauges over a played chart, from its start to `endMs`: what the
 *  client shows instead of running the sim itself. */
export const strainSamples = (
	bot: { strainsAt(t: number): Readonly<Record<string, number>> },
	skills: readonly string[],
	endMs: number,
): StrainSamples => {
	const values: number[][] = [];
	for (let t = 0; t <= endMs; t += STRAIN_EVERY_MS) {
		const strains = bot.strainsAt(t);
		values.push(skills.map(s => Math.round(Math.min(1, Math.max(0, strains[s] ?? 0)) * 100)));
	}
	return {
		from: 0, every: STRAIN_EVERY_MS, skills: [...skills], values,
	};
};

/** Play a mania chart through to its end: the score, the checkpoints, and the
 *  replay in the order the client may learn it. */
export const runManiaPlay = (
	chart: Beatmap,
	bot: Bot,
	options: ManiaGameOptions & { rate: number, mods: NonNullable<ManiaGameOptions['mods']> },
	round: boolean,
) => {
	const game = new ManiaGame(chart, bot, options);
	// advance to the end in steps, checkpointing accuracy/grade along the way
	// (update judges incrementally, so stepping does no extra work) - the live
	// state poll reads these back for the resume banner
	const samples: PlaySample[] = [];
	let frozen: PlaySample | undefined;
	const sample = (t: number) => {
		const { accuracy, grade, score, combo, failed } = game.score;
		// a round plays on past a fail, its score with it
		frozen ??= failed && !round ? [t, accuracy, grade, Math.round(score), combo, true] : undefined;
		samples.push(frozen
			? [t, accuracy, grade, frozen[3], frozen[4], true]
			: [t, accuracy, grade, Math.round(score), combo, failed]);
	};
	for (let t = 0; t <= game.songEndMs; t += SAMPLE_STEP_MS) {
		game.update(t);
		sample(t);
	}
	game.update(game.songEndMs + 1000); // past the end so every note is judged
	sample(game.songEndMs + 1000);

	// Where the play ends in song time, and the fail it records. A round plays
	// on past its fail to the map's end; a fail with EZ tells no medal how far it got.
	const { score } = game;
	const failedAt = score.failed ? score.failedIndex : undefined;
	const lastNoteEnd = game.notes.reduce((m, n) => Math.max(m, n.hold ? n.endTime : n.time), 0);
	const failSongTime = failedAt ? game.hits[failedAt - 1].time : lastNoteEnd;

	// Sort the offsets by reveal time (their note's nominal time) so the client can
	// stream them in with a simple forward cursor and never learn the outcome early.
	const noteById = new Map(game.notes.map(n => [n.getId(), n]));
	const revealOf = (o: ReplayOffset) => {
		const note = noteById.get(o.id)!;
		return o.tail ? note.endTime : note.time;
	};
	const ordered = game.replayOffsets()
		.map(o => ({
			o, reveal: revealOf(o),
		}))
		.sort((a, b) => a.reveal - b.reveal);

	const c = score.counts;
	const played: Omit<Simulated, 'skillXp' | 'strain'> = {
		score: Math.round(score.score),
		accuracy: score.accuracy,
		maxCombo: score.maxCombo,
		grade: score.grade,
		ur: unstableRate(game.hits),
		pfc: c.MISS === 0 && c.BAD === 0 && c.GOOD === 0,
		counts: { ...c },
		samples,
		offsets: ordered.map(x => x.o),
		reveals: ordered.map(x => x.reveal),
		songStartMs: game.songStartMs,
		lastNoteEnd,
		endSongTime: round ? lastNoteEnd : failSongTime,
		...failedAt ? {
			failedAt,
			...countsForMedals(options.mods) ? {
				failProgress: failSongTime / lastNoteEnd, failSeconds: failSongTime / options.rate / 1000,
			} : {},
		} : {},
	};
	return {
		game, played, 
	};
};

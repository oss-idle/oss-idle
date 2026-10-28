import type { Beatmap } from 'osu-classes';

import type {
	DebugAnalysis,
	DebugHit,
	DebugSeries,
} from '../analysis.js';
import { JUDGEMENT } from '../judgement.js';
import {
	type HitRecord,
	ManiaGame,
	type ManiaGameOptions,
} from '../maniaGame.js';
import type RuntimeNote from '../runtimeNote.js';
import {
	type HitWindows,
	judge,
	judgeRelease,
	ScoreState,
} from '../scoring.js';
import CharacterBot, { type NoteStrain } from './bots/character.js';
import type Skill from './skills/skill.js';

const hitOf = ({
	time, offset, judgement, hp,
}: HitRecord): DebugHit => (hp === undefined
	? [time, offset, judgement]
	: [time, offset, judgement, hp]);

const scoreOf = (score: ScoreState): DebugSeries['score'] => ({
	score: score.score, accuracy: score.accuracy, counts: { ...score.counts },
});

/** Song time at which a play failed (HP hit 0), or undefined if it survived. */
const failMsOf = (score: ScoreState, hits: readonly HitRecord[]): number | undefined =>
	(score.failedIndex > 0 ? hits[score.failedIndex - 1]?.time : undefined);

const scoreFromHits = (hp: number, od: number, hits: readonly HitRecord[]): ScoreState => {
	const score = new ScoreState(hp, od, hits.length);
	for (const h of hits) score.add(h.judgement);
	return score;
};

type Building = { hits: HitRecord[], overlay?: [number, number][] };

/** One skill's strain on one note: the consistency pressure overlay, and the press
 *  (or release, for held notes) as a hit. */
const record = (
	series: Building,
	skill: string,
	note: RuntimeNote,
	[strain, press, release]: [NoteStrain, number, number],
	windows: HitWindows,
): void => {
	if (skill === 'consistency' && strain.pressure !== undefined) {
		(series.overlay ??= []).push([note.time, strain.pressure]);
	}
	if (skill !== 'release') {
		const j = judge(Math.abs(press), windows);
		// match the combined graph: a miss has no meaningful offset
		series.hits.push({
			time: note.time, offset: j === JUDGEMENT.MISS ? null : press, judgement: j,
		});
	} else if (note.hold) {
		const j = judgeRelease(release, windows);
		series.hits.push({
			time: note.endTime, offset: j === JUDGEMENT.MISS ? null : release, judgement: j,
		});
	}
};

/** Every skill over `beatmap`, each alone, then the combined play the bot makes. */
export const analyze4k = (
	skills: Skill[],
	beatmap: Beatmap,
	options: Pick<ManiaGameOptions, 'rate' | 'mods' | 'divine'>,
): DebugAnalysis => {
	const bot = new CharacterBot(skills);
	const game = new ManiaGame(beatmap, bot, options);
	const { windows } = game;
	const { drainRate, overallDifficulty } = beatmap.difficulty;

	const building = new Map<string, Building>(skills.map(s => [s.name, { hits: [] }]));
	// the bot's own record of every note's strains
	for (const [, [note, strains]] of bot['noteStrains']) {
		for (const skill of skills) {
			const strain = strains.find(s => s[0].skill === skill.name);
			if (strain) record(building.get(skill.name)!, skill.name, note, strain, windows);
		}
	}

	game.update(game.songEndMs + 2000);
	const combined = game.score;
	const xp = bot.getSkillsXP(beatmap.totalLength / (options.rate ?? 1), combined);

	const series: DebugSeries[] = skills.map(skill => {
		const { hits, overlay } = building.get(skill.name)!;
		const score = scoreFromHits(drainRate, overallDifficulty, hits);
		return {
			name: skill.name,
			level: skill.level.get(),
			xp: xp[skill.name],
			failMs: failMsOf(score, hits),
			...overlay && { overlay },
			hits: hits.map(hitOf),
			score: scoreOf(score),
		};
	});
	series.push({
		name: 'combined',
		xp: Object.values(xp).reduce((sum, gain) => sum + gain, 0),
		failMs: failMsOf(combined, game.hits),
		hits: game.hits.map(hitOf),
		score: scoreOf(combined),
	});
	return {
		windows, songEndMs: game.songEndMs, series,
	};
};

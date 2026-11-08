import {
	useEffect,
	useRef,
	useState,
} from 'react';

import { Grades } from '@oss-idle/shared/grade';
import Log from '@oss-idle/shared/helpers/log';

import {
	type HistoryRow,
	Score,
	type ScoresChange,
} from '../db/schema/score';
import {
	type PlayHistory,
	rankKey,
} from '../osu/beatmap/grouping';

/** Fold maps' per-rate tops into `into`: a map's best at any rate is the best of its
 *  rates' bests (higher value, then earlier). */
const fold = (tops: HistoryRow[], into: PlayHistory) => {
	const anyRate = new Map<number, HistoryRow>();
	for (const top of tops) {
		const [id, rate, grade, value, scoreId, played, score] = top;
		into.bestRank.set(rankKey(id, rate), Grades.indexOf(grade));
		into.bestScore.set(rankKey(id, rate), score);
		const held = anyRate.get(id);
		if (!held || value > held[3] || (value === held[3] && scoreId < held[4])) anyRate.set(id, top);
		into.lastPlayed.set(id, Math.max(into.lastPlayed.get(id) ?? 0, played));
	}
	for (const [id, [, , grade, , , , score]] of anyRate) {
		into.bestRankAnyRate.set(id, Grades.indexOf(grade));
		into.bestScoreAnyRate.set(id, score);
	}
	return into;
};

const historyOf = async (characterId: number): Promise<PlayHistory> => fold(
	await Score.history(characterId),
	{
		bestRank: new Map(),
		bestRankAnyRate: new Map(),
		bestScore: new Map(),
		bestScoreAnyRate: new Map(),
		lastPlayed: new Map(),
	},
);

/** `history` with one map's entries read again. */
const withMap = (history: PlayHistory, beatmapId: number, tops: HistoryRow[]): PlayHistory => {
	const other = ([key]: [string, unknown]) => !key.startsWith(`${beatmapId}@`);
	const next: PlayHistory = {
		bestRank: new Map([...history.bestRank].filter(other)),
		bestRankAnyRate: new Map(history.bestRankAnyRate),
		bestScore: new Map([...history.bestScore].filter(other)),
		bestScoreAnyRate: new Map(history.bestScoreAnyRate),
		lastPlayed: new Map(history.lastPlayed),
	};
	next.bestRankAnyRate.delete(beatmapId);
	next.bestScoreAnyRate.delete(beatmapId);
	next.lastPlayed.delete(beatmapId);
	return fold(tops, next);
};

/**
 * The character's play history for song select's cards and sorts. A new play or a cleared
 * map reads that map again; only another character or a rebuild of the scores reads all
 * of them, which takes a while with a long history.
 */
export default function usePlayHistory(characterId: number, change: ScoresChange) {
	const [history, setHistory] = useState<PlayHistory>();
	const readFor = useRef<number>(undefined);
	// one read at a time, in order: a play landing during a full read still reaches the history
	const reads = useRef(Promise.resolve());
	useEffect(() => {
		const one = readFor.current === characterId ? change.beatmapId : undefined;
		readFor.current = characterId;
		const current = () => readFor.current === characterId;
		reads.current = reads.current.then(async () => {
			if (one !== undefined) {
				const tops = await Score.history(characterId, one);
				if (current()) setHistory(h => h && withMap(h, one, tops));
			} else {
				const h = await historyOf(characterId);
				if (current()) setHistory(h);
			}
		}).catch((e: unknown) => Log.errorPopup(String(e)));
	}, [characterId, change]);
	return history;
}

import { InferResponseType } from 'hono/client';

import { unwrap } from '@oss-idle/shared/apiBase';
import type { BoardSort } from '@oss-idle/shared/rankings';
import type { ScoreDTO } from '@oss-idle/shared/score';
import MemCache from '@oss-idle/shared/storage/memcache';

import Character from '../../db/schema/character';
import { Score } from '../../db/schema/score';
import {
	SCORE_TAB,
	type ScoreTab,
} from '../../db/settings';
import Entities from '../../entity/entities';
import { rpc } from '../client';

const endpoint = rpc.v1.scores;

type ScoreResponse = InferResponseType<typeof endpoint[':id']['$get'], 200>;
type BeatmapBoardResponse = InferResponseType<typeof endpoint['beatmap'][':beatmap']['board']['$get'], 200>;
export type BoardPlayer = BeatmapBoardResponse[number]['player'];
type MyBeatmapScoreResponse = InferResponseType<typeof endpoint['beatmap'][':beatmap']['me']['$get'], 200>;

export const getScore = (id: number): Promise<ScoreResponse> =>
	unwrap<ScoreResponse>(endpoint[':id'].$get({ param: { id: String(id) } }));

/** The signed-in character's own best on this beatmap + its rank by `sort`, global or
 *  within a country (null when signed out or no play yet). */
export const getMyBeatmapScore = (
	beatmap: number, 
	sort: BoardSort,
	country?: string,
): Promise<MyBeatmapScoreResponse> => unwrap<MyBeatmapScoreResponse>(country === undefined
	? endpoint['beatmap'][':beatmap']['me']
		.$get({
			param: { beatmap: String(beatmap) }, query: { sort },
		})
	: endpoint['beatmap'][':beatmap']['country'][':country']['me']
		.$get({
			param: {
				beatmap: String(beatmap), country,
			},
			query: { sort },
		}));

const boards = MemCache.get<BeatmapBoardResponse>('API.getBeatmapScores');

/** Every cached board of a map: global, country and friends, by score and by pp. */
export const flushBeatmapScores = async (beatmap: number) => {
	for (const key of boards.keys()) if (String(key).startsWith(`${beatmap}:`)) boards.delete(key);
};

const importScores = (scores: BeatmapBoardResponse[number]['score'][]) => {
	void (async () => {
		const mine = [];
		for (const score of scores) if (await Character.get(score.characterId)) mine.push(score);
		await Score.addServerScores(mine);
	})();
};

/** A map's leaderboard by `sort`: global, within a country, or among the signed-in
 *  player's friends. Each best with who set it. */
const getBeatmapScores = async (
	beatmap: number,
	sort: BoardSort,
	country?: string,
	friends?: boolean,
): Promise<BeatmapBoardResponse> => boards
	.process(`${beatmap}:${country ?? (friends ? 'friends' : '')}:${sort}`, async () => {
		const rows = await unwrap<BeatmapBoardResponse>(endpoint['beatmap'][':beatmap']['board'].$get({
			param: { beatmap: String(beatmap) },
			query: {
				country, friends: friends ? '1' : undefined, sort,
			},
		}));
		importScores(rows.map(r => r.score));
		return rows;
	}, 1000 * 60);

export type BoardRow = { score: Score | ScoreDTO, player?: BoardPlayer };

/** The tab a board shows: Country without a signed-in country, and Friends without
 *  oss!supporter, are Global. */
export const boardTab = (tab: ScoreTab, country?: string, supporter?: boolean): ScoreTab =>
	(tab === SCORE_TAB.COUNTRY && !country) || (tab === SCORE_TAB.FRIENDS && !supporter)
		? SCORE_TAB.GLOBAL
		: tab;

/** A map's scores for a song select tab (see {@link boardTab}), by `sort`: the local plays,
 *  the current character's, or the server's global, country or friends board. */
export const boardScores = async (
	beatmap: number,
	tab: ScoreTab,
	sort: BoardSort,
	country?: string,
): Promise<BoardRow[]> => {
	if (tab === SCORE_TAB.LOCAL || tab === SCORE_TAB.MINE) {
		const mine = tab === SCORE_TAB.MINE ? Entities.character.get().id : undefined;
		return (await Score.forBeatmap(beatmap, sort, mine)).map(score => ({ score }));
	}
	return getBeatmapScores(
		beatmap, sort, tab === SCORE_TAB.COUNTRY ? country : undefined, tab === SCORE_TAB.FRIENDS,
	);
};

/** A character's latest score on a beatmap, if any. */
export const getLatestScore = async (characterId: number, beatmapId: number) => {
	const res = await endpoint.character[':character'].beatmap[':beatmap'].latest.$get({
		param: {
			character: String(characterId), beatmap: String(beatmapId),
		},
	});
	return res.ok ? res.json() : undefined;
};

/** What the signed-in account's local scores are checked against (online/scoreSync.ts). */
export const fetchScoreState = async () => {
	const res = await rpc.v1.me.scores.state.$get();
	return res.ok ? await res.json() : undefined;
};
export type ScoreState = NonNullable<Awaited<ReturnType<typeof fetchScoreState>>>;

/** A page of the scores the signed-in account stored in `ruleset` after the id `after`:
 *  its ranked scores, or its unranked boards' plays. With `playedAfter` (epoch ms), from
 *  the first one played at or after it. */
export const fetchMyScores = async (
	ruleset: ScoreState['rulesets'][number],
	unranked: boolean,
	after: number,
	playedAfter?: number,
) => {
	const res = await rpc.v1.me.scores.$get({
		query: {
			ruleset,
			unranked: unranked ? '1' : undefined,
			after: String(after),
			playedAfter: playedAfter === undefined ? undefined : String(playedAfter),
		},
	});
	return res.ok ? await res.json() : undefined;
};

import { InferResponseType } from 'hono/client';

import { unwrap } from '@oss-idle/shared/apiBase';
import type { ScoreDTO } from '@oss-idle/shared/score';
import MemCache from '@oss-idle/shared/storage/memcache';

import Character from '../../db/schema/character';
import { Score } from '../../db/schema/score';
import { rpc } from '../client';

const endpoint = rpc.v1.scores;

type ScoreResponse = InferResponseType<typeof endpoint[':id']['$get'], 200>;
type BeatmapBoardResponse = InferResponseType<typeof endpoint['beatmap'][':beatmap']['board']['$get'], 200>;
export type BoardPlayer = BeatmapBoardResponse[number]['player'];
type MyBeatmapScoreResponse = InferResponseType<typeof endpoint['beatmap'][':beatmap']['me']['$get'], 200>;

export const getScore = (id: number): Promise<ScoreResponse> =>
	unwrap<ScoreResponse>(endpoint[':id'].$get({ param: { id: String(id) } }));

/** The signed-in character's own best on this beatmap + its rank, global or
 *  within a country (null when signed out or no play yet). */
export const getMyBeatmapScore = (
	beatmap: number, 
	country?: string,
): Promise<MyBeatmapScoreResponse> => unwrap<MyBeatmapScoreResponse>(country === undefined
	? endpoint['beatmap'][':beatmap']['me']
		.$get({ param: { beatmap: String(beatmap) } })
	: endpoint['beatmap'][':beatmap']['country'][':country']['me']
		.$get({
			param: {
				beatmap: String(beatmap), country,
			},
		}));

export const flushBeatmapScores = async (beatmap: number) => 
	MemCache.get<BeatmapBoardResponse>('API.getBeatmapScores')
		.delete(beatmap);

const importScores = (scores: BeatmapBoardResponse[number]['score'][]) => {
	void (async () => {
		for (const score of scores) {
			const char = await Character.get(score.characterId);
			if (!char) continue;
			const local = await Score.getByOnlineId(score.id);
			if (local) continue;
			Score.fromDTO(score).add();
		}
	})();
};

/** A map's leaderboard, global or within a country, each best with who set it. */
export const getBeatmapScores = async (
	beatmap: number,
	country?: string,
): Promise<BeatmapBoardResponse> => {
	return MemCache.get<BeatmapBoardResponse>('API.getBeatmapScores')
		.process(country ? `${beatmap}:${country}` : beatmap, async () => {
			const rows = await unwrap<BeatmapBoardResponse>(endpoint['beatmap'][':beatmap']['board'].$get({
				param: { beatmap: String(beatmap) },
				query: { country },
			}));
			importScores(rows.map(r => r.score));
			return rows;
		}, 1000 * 60);
};

export type BoardRow = { score: Score | ScoreDTO, player?: BoardPlayer };

/** A map's scores for a song select tab: the local plays, or the server's global or country board. */
export const boardScores = async (
	beatmap: number,
	local: boolean,
	country?: string,
): Promise<BoardRow[]> => local
	? (await Score.forBeatmap(beatmap)).map(score => ({ score }))
	: await getBeatmapScores(beatmap, country);

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

/** A page of every score the signed-in account ever stored in `ruleset`, after `after`. */
export const fetchMyScores = async (ruleset: ScoreState['rulesets'][number], after: number) => {
	const res = await rpc.v1.me.scores.$get({
		query: {
			ruleset, after: String(after),
		},
	});
	return res.ok ? await res.json() : undefined;
};

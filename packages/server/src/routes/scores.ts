import {
	and,
	desc,
	eq,
	inArray,
	isNull,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	BOARD_SORTS,
	type BoardSort,
} from '@oss-idle/shared/rankings';
import { rateSchema } from '@oss-idle/shared/rate';
import { betterScore } from '@oss-idle/shared/scoreOrder';

import {
	requireAuth,
	sessionUserId,
} from '../auth/middleware';
import {
	setColumns,
	withStatus,
} from '../beatmaps/catalog';
import {
	hasUnrankedBoard,
	unrankedBoard,
} from '../beatmaps/unrankedBoard';
import { db } from '../db/client';
import {
	beatmapListColumns,
	beatmaps,
} from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import {
	characters,
	currentCharacterOf,
	resolveAvatarUrl,
} from '../db/schema/character';
import {
	type ScoreRow,
	toScoreDTO,
} from '../db/schema/score';
import { users } from '../db/schema/user';
import {
	beatmapPageIds,
	beatmapRank,
	PAGE_SIZE,
} from '../rankings';
import { rulesetOfBeatmap } from '../rulesets/registry';
import { rulesetQuery } from '../rulesets/request';
import type { ServerRuleset } from '../rulesets/ruleset';
import { friendCharacterIds } from '../social';
import {
	idParam,
	valid,
} from '../validate';


/** The character ids on a map's board page one: by `sort`, then by score where the map
 *  gives no pp (loved: its pp board is empty). */
async function boardIds(
	r: ServerRuleset, beatmapId: number, country: string | undefined, sort: BoardSort,
) {
	const ids = await beatmapPageIds(r, beatmapId, 1, country, sort);
	if (ids.length || sort === 'score') return {
		ids, sort, 
	};
	return {
		ids: await beatmapPageIds(r, beatmapId, 1, country, 'score'), sort: 'score' as const, 
	};
}

const playerColumns = {
	id: characters.id,
	userId: users.id,
	name: characters.name,
	country: users.country,
	avatarUrl: characters.avatarUrl,
	osuAvatarUrl: users.avatarUrl,
};

/** These characters' bests on a map by `sort`, each with who set it, in one query. */
const bestsWithPlayers = (r: ServerRuleset, sort: BoardSort, beatmapId: number, ids: number[]) => {
	const t = sort === 'pp' ? r.bestPP : r.best;
	return db
		.select({
			score: t, player: playerColumns,
		})
		.from(t)
		.innerJoin(characters, eq(characters.id, t.characterId))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(and(eq(t.beatmapId, beatmapId), inArray(t.characterId, ids), isNull(users.restrictedAt)));
};

type Player = Awaited<ReturnType<typeof bestsWithPlayers>>[number]['player'];

const boardRow = (
	r: ServerRuleset, score: ScoreRow, { osuAvatarUrl, ...p }: Player, unranked = false,
) => ({
	score: toScoreDTO(score, r.def, unranked),
	player: {
		...p, avatarUrl: resolveAvatarUrl(p.avatarUrl, osuAvatarUrl),
	},
});

const ppFirst = (a: ScoreRow, b: ScoreRow) => Number(b.pp) - Number(a.pp) || a.id - b.id;

/** A player's unranked map: its own board, global only, no countries, no pp. */
async function unrankedBoardRows(r: ServerRuleset, beatmapId: number) {
	const rows = await unrankedBoard(r, beatmapId);
	const players = rows.length ? await db
		.select(playerColumns)
		.from(characters)
		.innerJoin(users, eq(users.id, characters.userId))
		.where(and(
			inArray(characters.id, rows.map(row => row.characterId)), isNull(users.restrictedAt),
		)) : [];
	const byId = new Map(players.map(p => [p.id, p]));
	return rows.flatMap(row => {
		const p = byId.get(row.characterId);
		return p ? [boardRow(r, row as ScoreRow, p, true)] : [];
	});
}

/** A map's board at one rate: each player's best play at it, by `sort`. */
async function rateBoard(r: ServerRuleset, beatmapId: number, rate: number, sort: BoardSort) {
	// ponytail: reads every play of the map at that rate; a per-rate best table if a map's plays get huge
	const rows = await db
		.select({
			score: r.score, player: playerColumns,
		})
		.from(r.score)
		.innerJoin(characters, eq(characters.id, r.score.characterId))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(and(
			eq(r.score.beatmapId, beatmapId), eq(r.score.rate, rate.toFixed(2)), isNull(users.restrictedAt),
		));
	const order = sort === 'pp' ? ppFirst : (a: ScoreRow, b: ScoreRow) => betterScore(a, b) ? -1 : 1;
	const best = new Map<number, typeof rows[number]>();
	for (const row of rows) {
		const held = best.get(row.score.characterId);
		if (!held || order(row.score, held.score) < 0) best.set(row.score.characterId, row);
	}
	return [...best.values()]
		.sort((a, b) => order(a.score, b.score))
		.slice(0, PAGE_SIZE)
		.map(row => boardRow(r, row.score, row.player));
}

/** A map's leaderboard page one: global, one country, or among friends (`among`),
 *  ordered by `sort`. Each best with who set it. */
export async function beatmapBoard(
	beatmapId: number,
	country?: string,
	among?: number[],
	sort: BoardSort = 'score',
) {
	const r = await rulesetOfBeatmap(beatmapId);
	if (!r) return [];
	if (among) {
		// an unranked map keeps no bests: its friends board is empty
		if (!among.length) return [];
		let rows = await bestsWithPlayers(r, sort, beatmapId, among);
		if (!rows.length && sort === 'pp') {
			rows = await bestsWithPlayers(r, 'score', beatmapId, among);
			sort = 'score';
		}
		const order = sort === 'pp' ? ppFirst : (a: ScoreRow, b: ScoreRow) => betterScore(a, b) ? -1 : 1;
		return rows
			.sort((a, b) => order(a.score, b.score))
			.slice(0, PAGE_SIZE)
			.map(row => boardRow(r, row.score, row.player));
	}
	// a map with a ranked board has no unranked one: only an empty board asks
	const page = await boardIds(r, beatmapId, country, sort);
	if (!page.ids.length) {
		return !country && await hasUnrankedBoard(beatmapId) ? unrankedBoardRows(r, beatmapId) : [];
	}
	const rows = await bestsWithPlayers(r, page.sort, beatmapId, page.ids);
	const byCharacter = new Map(rows.map(row => [row.score.characterId, row]));
	return page.ids.flatMap(id => {
		const row = byCharacter.get(id);
		return row ? [boardRow(r, row.score, row.player)] : [];
	});
}

/** The signed-in character's own best on this beatmap, with its rank (global or within
 *  a country) by `sort` - shown below the leaderboard even when outside the top 50. */
async function myBeatmapScore(
	userId: number, beatmapId: number, country?: string, sort: BoardSort = 'score',
) {
	const [current, r] = await Promise.all([currentCharacterOf(userId), rulesetOfBeatmap(beatmapId)]);
	const character = current?.character;
	if (!character || !r) return null;
	const mine = async (by: BoardSort) => {
		const t = by === 'pp' ? r.bestPP : r.best;
		const [row] = await db
			.select()
			.from(t)
			.where(and(eq(t.beatmapId, beatmapId), eq(t.characterId, character.id)))
			.limit(1);
		return row && {
			row, by,
		};
	};
	// loved maps keep no best by pp: their board is by score
	const found = await mine(sort) ?? (sort === 'pp' ? await mine('score') : undefined);
	if (!found) {
		// an unranked map keeps no bests: its board is its own
		return !country && await hasUnrankedBoard(beatmapId)
			? myUnrankedScore(r, character.id, beatmapId)
			: null;
	}
	const rank = await beatmapRank(r, beatmapId, character.id, country, found.by, found.row.id);
	return {
		score: toScoreDTO(found.row, r.def), rank,
	};
}

const boardQuery = valid('query', z.object({
	country: z.string().length(2).optional(),
	friends: z.literal('1').optional(),
	sort: z.enum(BOARD_SORTS).optional(),
	/** global, played at this rate only */
	rate: z.coerce.number().pipe(rateSchema).optional(),
}));

const sortQuery = valid('query', z.object({ sort: z.enum(BOARD_SORTS).optional() }));

/** The character's own score on an unranked map's board, with its place there. */
async function myUnrankedScore(r: ServerRuleset, characterId: number, beatmapId: number) {
	const board = await unrankedBoard(r, beatmapId, Infinity);
	const at = board.findIndex(row => row.characterId === characterId);
	return at < 0 ? null : {
		score: toScoreDTO(board[at], r.def, true), rank: at + 1, 
	};
}

/** A map's leaderboard page one, as the game shows it. */
const boardOf = async (beatmapId: number, country?: string) => {
	const r = await rulesetOfBeatmap(beatmapId);
	if (!r) return [];
	if (await hasUnrankedBoard(beatmapId)) {
		return country ? [] : (await unrankedBoard(r, beatmapId)).map(row => toScoreDTO(row, r.def, true));
	}
	const ids = await beatmapPageIds(r, beatmapId, 1, country);
	if (!ids.length) return [];
	const rows = await db
		.select()
		.from(r.best)
		.where(and(eq(r.best.beatmapId, beatmapId), inArray(r.best.characterId, ids)));
	const byCharacter = new Map(rows.map(row => [row.characterId, row]));
	return ids.flatMap(id => {
		const row = byCharacter.get(id);
		return row ? [toScoreDTO(row, r.def)] : [];
	});
};

export const scoresRoutes = new Hono()
	// the web map page: global, one country, or the viewer's friends
	.get('/beatmap/:beatmap/board', boardQuery, async c => {
		const {
			country, friends, sort, rate,
		} = c.req.valid('query');
		if (rate !== undefined) {
			const beatmapId = idParam.parse(c.req.param('beatmap'));
			const r = await rulesetOfBeatmap(beatmapId);
			return c.json(r ? await rateBoard(r, beatmapId, rate, sort ?? 'score') : []);
		}
		const viewer = friends ? await sessionUserId(c) : undefined;
		const among = viewer === undefined ? undefined : await friendCharacterIds(viewer);
		if (friends && !among) return c.json([]);
		return c.json(await beatmapBoard(idParam.parse(c.req.param('beatmap')), country, among, sort));
	})
	// the web score page: the score with its map, player and rank on the map, like osu!'s.
	// A score id is its ruleset's: `?ruleset=` says which.
	.get('/:id/show', async c => {
		const id = idParam.parse(c.req.param('id'));
		const r = rulesetQuery(c);
		const { score: scores, best } = r;
		const [row] = await db
			.select({
				score: scores,
				beatmap: beatmapListColumns,
				beatmapset: setColumns(r),
				player: {
					id: characters.id,
					userId: users.id,
					name: characters.name,
					country: users.country,
					avatarUrl: characters.avatarUrl,
					osuAvatarUrl: users.avatarUrl,
				},
			})
			.from(scores)
			.innerJoin(beatmaps, eq(beatmaps.id, scores.beatmapId))
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.innerJoin(...withStatus(r))
			.innerJoin(characters, eq(characters.id, scores.characterId))
			.innerJoin(users, eq(users.id, characters.userId))
			.where(and(eq(scores.id, id), isNull(users.restrictedAt)))
			.limit(1);
		if (!row) throw new HTTPException(404, { message: 'Score not found' });

		// only the player's best on the map holds a rank
		const [isBest] = await db.select({ id: best.id }).from(best).where(eq(best.id, id)).limit(1);
		const { osuAvatarUrl, ...player } = row.player;
		return c.json({
			ruleset: r.def.id,
			score: toScoreDTO(row.score, r.def),
			beatmap: row.beatmap,
			beatmapset: row.beatmapset,
			player: {
				...player, avatarUrl: resolveAvatarUrl(player.avatarUrl, osuAvatarUrl), 
			},
			rank: isBest ? await beatmapRank(r, row.score.beatmapId, row.score.characterId) : undefined,
		});
	})
	.get('/:id', async c => {
		const id = idParam.parse(c.req.param('id'));
		const { score: scores } = rulesetQuery(c);

		const [row] = await db.select().from(scores).where(eq(scores.id, id)).limit(1);

		if (!row) throw new HTTPException(404, { message: 'Score not found' });

		return c.json(row);
	})
	// a match player's latest score on the round's map, for the multiplayer ranking
	.get('/character/:character/beatmap/:beatmap/latest', async c => {
		const beatmapId = idParam.parse(c.req.param('beatmap'));
		const r = await rulesetOfBeatmap(beatmapId);
		if (!r) throw new HTTPException(404, { message: 'Score not found' });
		const { score: scores } = r;
		const [row] = await db
			.select()
			.from(scores)
			.where(and(
				eq(scores.characterId, idParam.parse(c.req.param('character'))),
				eq(scores.beatmapId, beatmapId),
			))
			.orderBy(desc(scores.playedAt))
			.limit(1);
		if (!row) throw new HTTPException(404, { message: 'Score not found' });
		return c.json(toScoreDTO(row, r.def));
	})
	.get('/beatmap/:beatmap', async c => c.json(
		await boardOf(idParam.parse(c.req.param('beatmap')))))
	.get('/beatmap/:beatmap/country/:country', async c => c.json(
		await boardOf(idParam.parse(c.req.param('beatmap')), c.req.param('country'))))
	.get('/beatmap/:beatmap/me', requireAuth, sortQuery, async c => c.json(
		await myBeatmapScore(
			c.get('userId'),
			idParam.parse(c.req.param('beatmap')),
			undefined,
			c.req.valid('query').sort,
		)))
	.get('/beatmap/:beatmap/country/:country/me', requireAuth, sortQuery, async c => c.json(
		await myBeatmapScore(
			c.get('userId'), 
			idParam.parse(c.req.param('beatmap')),
			c.req.param('country'),
			c.req.valid('query').sort,
		)));

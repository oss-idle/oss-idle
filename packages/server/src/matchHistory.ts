import {
	and,
	asc,
	eq,
	inArray,
	sql,
} from 'drizzle-orm';

import { type Grade } from '@oss-idle/shared/grade';
import { isAdmin } from '@oss-idle/shared/groups';
import type {
	MatchEvent,
	RoundScore,
} from '@oss-idle/shared/multiplayer';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { db } from './db/client';
import {
	beatmapListColumns,
	beatmaps,
} from './db/schema/beatmap';
import { beatmapset } from './db/schema/beatmapset';
import { characters } from './db/schema/character';
import {
	matches,
	matchEvents,
	matchGames,
} from './db/schema/match';
import { judgementsOf } from './db/schema/score';
import { users } from './db/schema/user';
import { groupsOf } from './groups';
import { ENABLED_RULESETS } from './rulesets/enabled';
import { rulesetFor } from './rulesets/registry';

/**
 * A multiplayer match's history in MySQL, the page "Match history available
 * here" links to. Writing it never holds a match up: a failed write is logged.
 */

const logged = (what: string) => (e: unknown) => console.error('[mp history]', what, e);

/** Open the history of a new match; its id is the match's id. */
export const openMatch = async (name: string, isPublic: boolean): Promise<number> => {
	const [row] = await db.insert(matches).values({
		name, isPublic,
	});
	return row.insertId;
};

export const recordEvent = (
	matchId: number,
	type: MatchEvent,
	characterId?: number,
	gameId?: number,
): void => {
	// stamped when it happens, not when the insert lands: a leave and the close
	// it causes are written concurrently
	void db.insert(matchEvents).values({
		matchId, type, characterId, gameId, at: new Date(),
	}).catch(logged(type));
};

export const closeMatch = (matchId: number): void => {
	recordEvent(matchId, 'close');
	void db.update(matches).set({ endedAt: new Date() })
		.where(eq(matches.id, matchId))
		.catch(logged('close'));
};

export const startGame = async (
	matchId: number,
	beatmapId: number,
	ruleset: RulesetId,
): Promise<number | undefined> => {
	try {
		const [row] = await db.insert(matchGames).values({
			matchId, beatmapId, ruleset,
		});
		recordEvent(matchId, 'game', undefined, row.insertId);
		return row.insertId;
	} catch (e) {
		logged('game')(e);
		return undefined;
	}
};

export type GameScoreDetail = {
	grade: Grade,
	judgements: Record<string, number>,
};

export const endGame = (
	gameId: number,
	ruleset: RulesetId,
	players: { final: RoundScore, detail: GameScoreDetail }[],
): void => {
	void (async () => {
		await db.update(matchGames).set({ endedAt: new Date() }).where(eq(matchGames.id, gameId));
		if (!players.length) return;
		await db.insert(rulesetFor(ruleset).matchScores).values(players.map(({ final, detail }) => ({
			gameId,
			characterId: final.characterId,
			score: Math.round(final.score),
			maxCombo: final.combo,
			accuracy: String(final.accuracy ?? 0),
			failed: final.failed,
			grade: detail.grade,
			...detail.judgements,
		})));
	})().catch(logged('end game'));
};

/** A private history is for its players (any character of theirs) and admins. */
const canView = async (matchId: number, isPublic: boolean, userId?: number): Promise<boolean> => {
	if (isPublic || isAdmin(await groupsOf(userId))) return true;
	if (userId === undefined) return false;
	const [row] = await db
		.select({ id: matchEvents.id })
		.from(matchEvents)
		.innerJoin(characters, eq(characters.id, matchEvents.characterId))
		.where(and(eq(matchEvents.matchId, matchId), eq(characters.userId, userId)))
		.limit(1);
	return !!row;
};

type Player = { id: number, name: string, country: string };

const players = async (ids: number[]): Promise<Map<number, Player>> => {
	if (!ids.length) return new Map();
	const rows = await db
		.select({
			id: characters.id, name: characters.name, country: users.country,
		})
		.from(characters)
		.innerJoin(users, eq(users.id, characters.userId))
		.where(inArray(characters.id, ids));
	return new Map(rows.map(r => [r.id, r]));
};

const games = async (matchId: number) => {
	const rows = await db
		.select({
			game: matchGames,
			beatmap: {
				...beatmapListColumns, creator: beatmapset.creator, osuSetId: beatmapset.osuId, osuCover: beatmapset.osuCover,
			},
		})
		.from(matchGames)
		.innerJoin(beatmaps, eq(beatmaps.id, matchGames.beatmapId))
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.where(eq(matchGames.matchId, matchId));
	// each game's scores are in its ruleset's table; a ruleset not played here has none
	const scores = (await Promise.all(ENABLED_RULESETS.map(async id => {
		const ids = rows.filter(r => r.game.ruleset === id).map(r => r.game.id);
		if (!ids.length) return [];
		const r = rulesetFor(id);
		return (await db.select().from(r.matchScores).where(inArray(r.matchScores.gameId, ids)))
			.map(s => ({
				...s, judgements: judgementsOf(s as never, r.def),
			}));
	}))).flat();
	return {
		rows, scores,
	};
};

/** The whole history, or undefined when it doesn't exist or isn't the viewer's to see. */
export const matchHistory = async (matchId: number, userId?: number) => {
	const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
	if (!match || !await canView(matchId, match.isPublic, userId)) return undefined;

	const events = await db
		.select()
		.from(matchEvents)
		.where(eq(matchEvents.matchId, matchId))
		// the last player leaving and the match closing land in the same instant
		.orderBy(asc(matchEvents.at), sql`${matchEvents.type} = 'close'`, asc(matchEvents.id));
	const { rows, scores } = await games(matchId);
	const who = await players([...new Set([
		...events.map(e => e.characterId),
		...scores.map(s => s.characterId),
	].filter((id): id is number => id !== null))]);

	return {
		id: match.id,
		name: match.name,
		createdAt: match.createdAt.getTime(),
		endedAt: match.endedAt?.getTime(),
		events: events.map(e => {
			const game = rows.find(r => r.game.id === e.gameId);
			return {
				id: e.id,
				type: e.type,
				at: e.at.getTime(),
				player: e.characterId === null ? undefined : who.get(e.characterId),
				game: game && {
					ruleset: game.game.ruleset,
					beatmap: game.beatmap,
					startedAt: game.game.startedAt.getTime(),
					endedAt: game.game.endedAt?.getTime(),
					scores: scores
						.filter(s => s.gameId === game.game.id)
						.sort((a, b) => b.score - a.score)
						.map(s => ({
							player: who.get(s.characterId),
							score: s.score,
							maxCombo: s.maxCombo,
							accuracy: Number(s.accuracy),
							failed: s.failed,
							grade: s.grade,
							judgements: s.judgements,
						})),
				},
			};
		}),
	};
};

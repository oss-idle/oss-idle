import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNull,
	type SQL,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import type {
	ApiCountryRanking,
	ApiFriend,
	ApiMatch,
	ApiRanking,
	ApiSkillRanking,
	ApiUserRanking,
} from '@oss-idle/shared/apiV2';
import { batchIds } from '@oss-idle/shared/oauth';
import {
	playLevelOf,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import {
	liveDiffCondition,
	setColumns,
	withStatus,
} from '../beatmaps/catalog';
import { db } from '../db/client';
import {
	beatmapListColumns,
	beatmaps,
} from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { bestPPRows } from '../db/schema/best_pp';
import {
	characters,
	profileOf,
	resolveAvatarUrl,
} from '../db/schema/character';
import { getCharacterTotals } from '../db/schema/character_totals';
import { firstPlaceRows } from '../db/schema/first_place';
import { news } from '../db/schema/news';
import {
	recentScoreRows,
	toScoreDTO,
} from '../db/schema/score';
import { users } from '../db/schema/user';
import { matchHistory } from '../matchHistory';
import {
	apiToken,
	needs,
} from '../oauth';
import {
	countryRank,
	globalRank,
	medalsPage,
	PAGE_SIZE,
	ppPage,
	scorePage,
} from '../rankings';
import { rateLimit } from '../rateLimit';
import {
	countryPage,
	skillRanking,
} from '../routes/ranking';
import { beatmapBoard } from '../routes/scores';
import {
	rulesetFor,
	rulesetOfBeatmap,
	rulesetOfChart,
} from '../rulesets/registry';
import { apiRuleset } from '../rulesets/request';
import type { ServerRuleset } from '../rulesets/ruleset';
import { friendsOf } from '../social';
import {
	idParam,
	valid,
} from '../validate';
import {
	apiBeatmap,
	apiBeatmapset,
	apiNewsPost,
	apiScore,
	apiUser,
	statistics,
	userCompact,
	userStatistics,
} from './objects';
import {
	simulate,
	simulateBody,
} from './simulate';


const notFound = (what: string) => new HTTPException(404, { message: `${what} not found` });

/** A visible account with the character a lookup lands on. */
const userWhere = async (where: SQL | undefined, on: SQL) => {
	const [row] = await db
		.select({
			user: users, character: characters,
		})
		.from(users)
		.innerJoin(characters, on)
		.where(and(where, isNull(users.restrictedAt)))
		.limit(1);
	if (!row) throw notFound('User');
	return row;
};

/** `{user}` is an account id, or `@name` (a current character's name). */
const byUser = (param: string) => {
	const name = param.startsWith('@') ? param.slice(1) : undefined;
	if (name === undefined && !/^\d+$/.test(param)) throw notFound('User');
	return userWhere(
		name === undefined ? eq(users.id, Number(param)) : eq(characters.name, name),
		eq(characters.id, users.currentCharacter),
	);
};

const byCharacter = (id: number) =>
	userWhere(eq(characters.id, id), eq(characters.userId, users.id));

const fullUser = async (
	r: ServerRuleset,
	{ user, character }: Awaited<ReturnType<typeof byCharacter>>,
) => {
	const [profile, totals, global, country] = await Promise.all([
		profileOf(r, character.id),
		getCharacterTotals(r, character.id),
		globalRank(r, 'pp', character.id),
		countryRank(r, 'pp', user.country, character.id),
	]);
	return apiUser(r.def, user, character, profile, totals, {
		global, country,
	});
};

const listQuery = valid('query', z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
}));

type ScoreType = 'best' | 'firsts' | 'recent';

const characterScores = async (
	ruleset: ServerRuleset,
	characterId: number,
	type: ScoreType,
	offset: number,
	limit: number,
) => {
	const rows = type === 'best'
		? (await bestPPRows(ruleset, characterId, offset, limit)).map(r => ({
			...r, score: r.best_pp,
		}))
		: type === 'firsts'
			? (await firstPlaceRows(ruleset, characterId, offset, limit)).map(r => ({
				...r, score: r.first_place,
			}))
			: await recentScoreRows(ruleset, characterId, offset, limit);
	return rows.map(r => ({
		...apiScore(ruleset.def, toScoreDTO(r.score, ruleset.def)),
		beatmap: apiBeatmap(r.beatmap, r.beatmapset),
		beatmapset: apiBeatmapset(r.beatmapset),
	}));
};

/** A live difficulty, with its set as its ruleset has it. */
const beatmapWhere = async (where: SQL) => {
	const [diff] = await db.select({
		mode: beatmaps.mode, keys: beatmaps.keys, 
	})
		.from(beatmaps).where(where).limit(1);
	const r = diff && rulesetOfChart(diff.mode, diff.keys);
	if (!r) throw notFound('Beatmap');
	const [row] = await db
		.select({
			beatmap: beatmapListColumns, set: setColumns(r),
		})
		.from(beatmaps)
		.innerJoin(beatmapset, eq(beatmaps.setId, beatmapset.id))
		.innerJoin(...withStatus(r))
		.where(and(where, liveDiffCondition(r)))
		.limit(1);
	if (!row) throw notFound('Beatmap');
	return {
		...apiBeatmap(row.beatmap, row.set), beatmapset: apiBeatmapset(row.set),
	};
};

const scoreType = z.enum(['best', 'firsts', 'recent']);

const countryCode = z.string().length(2).toUpperCase().optional();

const boardQuery = valid('query', z.object({ country: countryCode }));
const lookupQuery = z.object({ osu_id: idParam });

const rankingQuery = valid('query', z.object({
	country: countryCode,
	'cursor[page]': z.coerce.number().int().min(1).max(200).default(1),
}));

type Hydrated = Awaited<ReturnType<typeof ppPage>>[number];

const rankingEntry = (ruleset: ServerRuleset, r: Hydrated, rank: number): ApiUserRanking => ({
	rank,
	...userStatistics(ruleset.def, r.profile, r.totals, {}),
	user: userCompact({
		userId: r.user.id,
		characterId: r.character.id,
		name: r.character.name,
		country: r.user.country,
		avatarUrl: resolveAvatarUrl(r.character.avatarUrl, r.user.avatarUrl),
	}),
});

/** osu!'s ranking page: 50 rows, and the cursor for the next page while there is one. */
const rankingPage = <T>(rows: T[], page: number): ApiRanking<T> => ({
	ranking: rows,
	...rows.length === PAGE_SIZE && { cursor: { page: page + 1 } },
});

const rankOf = (page: number, i: number) => (page - 1) * PAGE_SIZE + i + 1;

/** osu!'s modes as a path segment; the ones oss! doesn't play answer 404. */
const MODE = ':mode{osu|taiko|fruits|mania}';

/** osu!'s rankings, with the mode in the path or `?mode=`. */
const rankingRoutes = new Hono()
	.get('/country', needs('public'), rankingQuery, async c => {
		const page = c.req.valid('query')['cursor[page]'];
		return c.json(rankingPage((await countryPage(apiRuleset(c), page)).map((r, i) => ({
			rank: rankOf(page, i),
			code: r.country,
			active_users: r.players,
			play_count: r.playCount,
			ranked_score: r.rankedScore,
			performance: r.pp,
		}) satisfies ApiCountryRanking), page));
	})

	.get('/skill/:skill', needs('public'), rankingQuery, async c => {
		const { country, 'cursor[page]': page } = c.req.valid('query');
		const skill = c.req.param('skill');
		const ruleset = apiRuleset(c);
		const rows = await skillRanking(ruleset, skill, page, country);
		return c.json(rankingPage(rows.map((r, i) => ({
			...rankingEntry(ruleset, r, rankOf(page, i)),
			skill: skill === 'overall'
				? { level: xpGivesLevel(r.profile.overallLifetimeXp).level }
				: {
					level: Math.floor(playLevelOf(
						r.profile.skills[skill].level,
						r.profile.skills[skill].xp,
						r.profile.skills[skill].lifetimeXp,
						r.profile.skills[skill].prestige,
					)),
					prestige: r.profile.skills[skill].prestige,
				},
		}) satisfies ApiSkillRanking), page));
	})

	.get('/:type', needs('public'), rankingQuery, async c => {
		const { country, 'cursor[page]': page } = c.req.valid('query');
		const type = z.enum(['performance', 'score', 'medals']).safeParse(c.req.param('type'));
		if (!type.success) throw notFound('Ranking');
		const ruleset = apiRuleset(c);
		if (type.data === 'medals') {
			return c.json(rankingPage((await medalsPage(ruleset, page, country)).map((r, i) => ({
				...rankingEntry(ruleset, r, rankOf(page, i)), medals: r.medals,
			})), page));
		}
		const rows = type.data === 'performance'
			? await ppPage(ruleset, page, country)
			: await scorePage(ruleset, page, country);
		return c.json(rankingPage(rows.map((r, i) => rankingEntry(ruleset, r, rankOf(page, i))), page));
	})
;

export const apiV2Routes = new Hono()
	.use('*', rateLimit('api-v2', 1200))
	.use('*', apiToken)
	// osu!'s documented ceiling, per application (the game's, per player)
	.use('*', rateLimit('api-v2-client', 1200, c => {
		const { clientId, userId } = c.get('token');
		return clientId === undefined ? `game:${userId}` : String(clientId);
	}))

	// osu!'s mode, in the path where osu! puts it; `?mode=` elsewhere
	.get(`/me/${MODE}?`, needs('identify'), async c => {
		const userId = c.get('token').userId;
		if (userId === undefined) throw new HTTPException(403, { message: 'This request needs a user token' });
		return c.json(await fullUser(apiRuleset(c), await byUser(String(userId))));
	})

	.get('/friends', needs('friends.read'), async c => {
		const userId = c.get('token').userId;
		if (userId === undefined) throw new HTTPException(403, { message: 'This request needs a user token' });
		return c.json((await friendsOf(userId)).map(f => ({
			...userCompact({
				userId: f.userId,
				characterId: f.character.id,
				name: f.character.name,
				country: f.character.country,
				avatarUrl: f.character.avatarUrl,
			}),
			is_online: f.online,
			is_mutual: f.mutual,
		}) satisfies ApiFriend));
	})

	// the sim API (simulate.ts): a character state's play on a live map
	.post(
		'/simulate',
		needs('simulate'),
		rateLimit('api-v2-simulate', 1200, c => String(c.get('token').userId)),
		valid('json', simulateBody),
		async c => {
			const answer = await simulate(c.req.valid('json'));
			if (!('error' in answer)) return c.json(answer);
			const wait = answer.status === 429 ? { 'Retry-After': '1' } : undefined;
			return c.json({ error: answer.error }, answer.status, wait);
		},
	)

	.get(`/users/:user/${MODE}?`, needs('public'), async c =>
		c.json(await fullUser(apiRuleset(c), await byUser(c.req.param('user')))))

	.get('/users/:user/scores/:type', needs('public'), listQuery, async c => {
		const { character } = await byUser(c.req.param('user'));
		const { limit, offset } = c.req.valid('query');
		const type = scoreType.parse(c.req.param('type'));
		return c.json(await characterScores(apiRuleset(c), character.id, type, offset, limit));
	})

	.get('/characters', needs('public'), async c => {
		const ids = batchIds.parse(c.req.queries('ids[]') ?? []);
		if (!ids.length) return c.json({ characters: [] });
		const rows = await db
			.select({
				user: users, character: characters,
			})
			.from(users)
			.innerJoin(characters, eq(characters.userId, users.id))
			.where(and(inArray(characters.id, ids), isNull(users.restrictedAt)));
		const r = apiRuleset(c);
		return c.json({ characters: await Promise.all(rows.map(row => fullUser(r, row))) });
	})

	.get(`/characters/:id/${MODE}?`, needs('public'), async c =>
		c.json(await fullUser(apiRuleset(c), await byCharacter(idParam.parse(c.req.param('id'))))))

	.get('/characters/:id/scores/:type', needs('public'), listQuery, async c => {
		const { character } = await byCharacter(idParam.parse(c.req.param('id')));
		const { limit, offset } = c.req.valid('query');
		const type = scoreType.parse(c.req.param('type'));
		return c.json(await characterScores(apiRuleset(c), character.id, type, offset, limit));
	})

	.get('/beatmaps/lookup', needs('public'), valid('query', lookupQuery), async c => {
		return c.json(await beatmapWhere(eq(beatmaps.osuId, c.req.valid('query').osu_id)));
	})

	.get('/beatmaps/:id', needs('public'), async c =>
		c.json(await beatmapWhere(eq(beatmaps.id, idParam.parse(c.req.param('id'))))))

	.get('/beatmaps/:id/scores', needs('public'), boardQuery, async c => {
		const beatmapId = idParam.parse(c.req.param('id'));
		const r = await rulesetOfBeatmap(beatmapId);
		const rows = r ? await beatmapBoard(beatmapId, c.req.valid('query').country) : [];
		return c.json({
			scores: rows.map(({ score, player }) => ({
				...apiScore(r!.def, score),
				user: userCompact({
					userId: player.userId,
					characterId: player.id,
					name: player.name,
					country: player.country,
					avatarUrl: player.avatarUrl,
				}),
			})), 
		});
	})

	.get('/beatmapsets/:id', needs('public'), async c => {
		const r = apiRuleset(c);
		const rows = await db
			.select({
				set: setColumns(r), beatmap: beatmapListColumns,
			})
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmaps.setId, beatmapset.id))
			.innerJoin(...withStatus(r))
			.where(and(eq(beatmapset.id, idParam.parse(c.req.param('id'))), liveDiffCondition(r)))
			.orderBy(asc(beatmaps.sr));
		if (!rows.length) throw notFound('Beatmapset');
		return c.json(apiBeatmapset(rows[0].set, rows.map(r => r.beatmap)));
	})

	.route('/rankings', rankingRoutes)
	.route(`/rankings/${MODE}`, rankingRoutes)

	.get('/matches/:id', needs('public'), async c => {
		const match = await matchHistory(idParam.parse(c.req.param('id')), c.get('token').userId);
		if (!match) throw notFound('Match');
		const users = new Map<number, { character_id: number; username: string; country_code: string }>();
		const player = (p?: { id: number; name: string; country: string }) => {
			if (!p) return undefined;
			users.set(p.id, {
				character_id: p.id, username: p.name, country_code: p.country,
			});
			return p.id;
		};
		const events = match.events.map(e => ({
			id: e.id,
			type: e.type,
			timestamp: new Date(e.at).toISOString(),
			character_id: player(e.player),
			...e.game && {
				game: {
					beatmap_id: e.game.beatmap.id,
					start_time: new Date(e.game.startedAt).toISOString(),
					end_time: e.game.endedAt === undefined ? undefined : new Date(e.game.endedAt).toISOString(),
					scores: e.game.scores.map(s => ({
						character_id: player(s.player),
						score: s.score,
						accuracy: s.accuracy,
						max_combo: s.maxCombo,
						rank: s.grade,
						passed: !s.failed,
						statistics: statistics(rulesetFor(e.game!.ruleset).def, s.judgements),
					})),
				}, 
			},
		}));
		return c.json({
			match: {
				id: match.id,
				name: match.name,
				start_time: new Date(match.createdAt).toISOString(),
				end_time: match.endedAt === undefined ? undefined : new Date(match.endedAt).toISOString(),
			},
			events,
			users: [...users.values()],
		} satisfies ApiMatch);
	})

	.get('/news', needs('public'), listQuery, async c => {
		const { limit, offset } = c.req.valid('query');
		const rows = await db
			.select({
				post: news, author: users.username,
			})
			.from(news)
			.leftJoin(users, eq(users.id, news.authorId))
			.where(eq(news.published, true))
			.orderBy(desc(news.publishedAt))
			.offset(offset)
			.limit(limit);
		return c.json({ news_posts: rows.map(r => apiNewsPost(r.post, r.author ?? 'unknown')) });
	})

	.get('/news/:slug', needs('public'), async c => {
		const [row] = await db
			.select({
				post: news, author: users.username,
			})
			.from(news)
			.leftJoin(users, eq(users.id, news.authorId))
			.where(and(eq(news.slug, c.req.param('slug')), eq(news.published, true)))
			.limit(1);
		if (!row) throw notFound('News post');
		return c.json(apiNewsPost(row.post, row.author ?? 'unknown', true));
	});

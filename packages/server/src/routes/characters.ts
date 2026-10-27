import {
	and,
	asc,
	eq,
	isNull,
	like,
	sql,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { profileOrder } from '@oss-idle/shared/profile';
import { supportLevel } from '@oss-idle/shared/supporter';
import { rollbackBody } from '@oss-idle/shared/upgrades';

import { requireAdmin } from '../auth/admin';
import { sessionUserId } from '../auth/middleware';
import {
	countCurated,
	getCurated,
} from '../beatmaps/curated';
import {
	countMapped,
	getMapped,
} from '../beatmaps/mapped';
import { performUpgradeRevert } from '../character/actions';
import { pushCharacter } from '../character/push';
import { db } from '../db/client';
import { likeEscape } from '../db/columns';
import {
	getMostPlayed,
	getPlayCounts,
	getTotalPlayed,
} from '../db/schema/beatmaps_played';
import { getBestPP } from '../db/schema/best_pp';
import {
	type CharacterRow,
	characters,
	getCharacterById,
	profileDTO,
	profileOf,
	resolveAvatarUrl,
	resolveBannerUrl,
} from '../db/schema/character';
import { getMedals } from '../db/schema/character_medal';
import { getCharacterTotals } from '../db/schema/character_totals';
import {
	getFirstPlaces,
	getNbFirstPlaces,
} from '../db/schema/first_place';
import { getFormerNames } from '../db/schema/name_history';
import { getRecentCharacterScores } from '../db/schema/score';
import {
	getUserById,
	supporterActive,
	users,
} from '../db/schema/user';
import {
	groupsByUser,
	groupsOf,
} from '../groups';
import {
	medalHolders,
	medalProgress,
} from '../medals';
import { isPlaying } from '../play';
import { renderProfileCard } from '../profileCard';
import {
	bestSkillRank,
	countryRank,
	globalRank,
	ppTopPercent,
} from '../rankings';
import { visibleTo } from '../restrictions';
import {
	rulesetParam,
	rulesetQuery,
} from '../rulesets/request';
import { userPageOf } from '../userPage';
import {
	idParam,
	valid,
} from '../validate';
import { offlineEntry } from '../ws/presence';

const mappedStatus = z.enum(['ranked', 'loved', 'unranked']);

type CharacterEnv = { Variables: { character: CharacterRow } };

/** Loads `:id`, hidden like its account when that is restricted. */
const loadCharacter = createMiddleware<CharacterEnv>(async (c, next) => {
	const character = await getCharacterById(idParam.parse(c.req.param('id')));
	const owner = character && await getUserById(character.userId);
	if (!character || (owner && !await visibleTo(owner, await sessionUserId(c)))) {
		throw new HTTPException(404, { message: 'Character not found' });
	}
	c.set('character', character);
	await next();
});

export const charactersRoutes = new Hono()
	// Players by name: the accounts' current characters, exact match first.
	.get('/search', async c => {
		const q = z.string().trim().min(1).max(32).safeParse(c.req.query('q'));
		if (!q.success) return c.json([]);
		const players = await db
			.select({
				userId: users.id,
				userAvatarUrl: users.avatarUrl,
				character: {
					id: characters.id,
					name: characters.name,
					avatarUrl: characters.avatarUrl,
				},
			})
			.from(users)
			.innerJoin(characters, eq(characters.id, users.currentCharacter))
			.where(and(isNull(users.restrictedAt), like(characters.name, `%${likeEscape(q.data)}%`)))
			.orderBy(sql`${characters.name} = ${q.data} desc`, asc(characters.name))
			.limit(50);
		const groups = await groupsByUser(players.map(p => p.userId));
		return c.json(players.map(({ userAvatarUrl, ...p }) => ({
			...p,
			character: {
				...p.character, avatarUrl: resolveAvatarUrl(p.character.avatarUrl, userAvatarUrl),
			},
			groups: groups.get(p.userId)!,
		})));
	})
	.use('/:id', loadCharacter)
	.use('/:id/*', loadCharacter)
	.get('/:id', rulesetParam, async c => {
		const row = c.get('character');
		const user = await getUserById(row.userId);

		const formerNames = (await getFormerNames(row.id)).filter(n => n !== row.name);

		const r = rulesetQuery(c, row);
		const profile = await profileOf(r, row.id);
		const { userPage, ...rest } = row;
		return c.json({
			// clients from before rulesets read the profile's columns flat
			...profile,
			...rest,
			ruleset: r.def.id,
			/** the ruleset the character plays, which `ruleset` shows unless asked for another */
			picked: row.ruleset,
			profile: profileDTO(profile, r.def),
			userPage: await userPageOf(userPage),
			profileOrder: profileOrder(row.profileOrder ?? undefined),
			avatarUrl: resolveAvatarUrl(row.avatarUrl, user?.avatarUrl),
			bannerUrl: resolveBannerUrl(row.bannerUrl),
			formerNames,
			restricted: Boolean(user?.restrictedAt),
			groups: await groupsOf(row.userId),
			supportLevel: supportLevel(
				supporterActive(user),
				user?.supporterMonths ?? 0,
			),
		});
	})

	// The chat's name card for a player who isn't online.
	.get('/:id/card', async c => {
		const row = c.get('character');
		const user = await getUserById(row.userId);
		if (!user) throw new HTTPException(404, { message: 'Character not found' });
		return c.json(await offlineEntry(row, user));
	})

	// The medals a character holds, newest first, and its progress toward the rest.
	.get('/:id/medals', rulesetParam, async c => {
		const character = c.get('character');
		const r = rulesetQuery(c, character);
		const [held, progress, holders] = await Promise.all([
			getMedals(r, character.id),
			medalProgress(r, character),
			medalHolders(r),
		]);
		return c.json({
			ruleset: r.def.id,
			held: held.map(m => ({
				id: m.medalId, unlockedAt: m.unlockedAt.getTime(),
			})),
			progress,
			holders,
		});
	})

	// Derived profile statistics: aggregates, grade/judgement totals and ranks.
	.get('/:id/stats', rulesetParam, async c => {
		const character = c.get('character');
		const r = rulesetQuery(c, character);
		const user = await getUserById(character.userId);
		const [totals, profile] = await Promise.all([
			getCharacterTotals(r, character.id),
			profileOf(r, character.id),
		]);

		const [globalRk, countryRk, scoreRk, overallRk, bestSkill, topPercent] = await Promise.all([
			globalRank(r, 'pp', character.id),
			countryRank(r, 'pp', user.country, character.id),
			globalRank(r, 'score', character.id),
			globalRank(r, 'overall', character.id),
			bestSkillRank(r, character.id),
			ppTopPercent(r, character.id),
		]);

		const stats = {
			ruleset: r.def.id,
			pp: Number(profile.pp),
			totalHits: totals.hits,
			globalRank: globalRk,
			/** the share of players with pp at or above this rank, 0..1 (osu!'s global_rank_percent) */
			globalRankPercent: topPercent === undefined ? undefined : topPercent / 100,
			rankHistory: profile.rankHistory?.ranks ?? [],
			highestRanks: profile.rankHistory?.highest ?? {},
			countryRank: countryRk,
			scoreRank: scoreRk,
			overallRank: overallRk,
			bestSkill,
			...totals,
		};

		return c.json(stats);
	})
	// The image a shared profile link unfurls into (nginx points og:image here).
	.get('/:id/card.png', rulesetParam, async c => {
		const character = c.get('character');
		const r = rulesetQuery(c, character);
		const user = await getUserById(character.userId);
		const [totals, profile, globalRk, countryRk, groups] = await Promise.all([
			getCharacterTotals(r, character.id),
			profileOf(r, character.id),
			globalRank(r, 'pp', character.id),
			countryRank(r, 'pp', user.country, character.id),
			groupsOf(character.userId),
		]);
		const png = await renderProfileCard({
			name: character.name,
			title: character.title ?? undefined,
			avatarUrl: resolveAvatarUrl(character.avatarUrl, user.avatarUrl),
			bannerUrl: resolveBannerUrl(character.bannerUrl),
			country: user.country,
			groups,
			globalRank: globalRk,
			countryRank: countryRk,
			pp: Number(profile.pp),
			playCount: totals.playCount,
		});
		c.header('Content-Type', 'image/png');
		c.header('Cache-Control', 'public, max-age=3600');
		return c.body(new Uint8Array(png));
	})
	.get('/:id/mostplayed/:page', rulesetParam, async c => {
		const character = c.get('character');
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getMostPlayed(rulesetQuery(c, character), character.id, page));
	})
	.get('/:id/countplayed', rulesetParam, async c => {
		const character = c.get('character');
		return c.json(await getTotalPlayed(rulesetQuery(c, character), character.id));
	})
	.get('/:id/playcounts', rulesetParam, async c => {
		const character = c.get('character');
		return c.json(await getPlayCounts(rulesetQuery(c, character), character.id));
	})
	.get('/:id/bestpp/:page', rulesetParam, async c => {
		const character = c.get('character');
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getBestPP(rulesetQuery(c, character), character.id, page));
	})
	.get('/:id/countfirstplaces', rulesetParam, async c => {
		const character = c.get('character');
		return c.json(await getNbFirstPlaces(rulesetQuery(c, character), character.id));
	})
	.get('/:id/firstplaces/:page', rulesetParam, async c => {
		const character = c.get('character');
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getFirstPlaces(rulesetQuery(c, character), character.id, page));
	})
	.get('/:id/recent/:page', rulesetParam, async c => {
		const character = c.get('character');
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getRecentCharacterScores(rulesetQuery(c, character), character.id, page));
	})
	// Ranked maps the character's account proposed.
	.get('/:id/countrankedmaps', rulesetParam, async c => {
		const character = c.get('character');
		return c.json(await countCurated(rulesetQuery(c, character), character.userId));
	})
	.get('/:id/rankedmaps/:page', rulesetParam, async c => {
		const character = c.get('character');
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getCurated(rulesetQuery(c, character), character.userId, page));
	})
	// The account's own maps: ranked or loved ones they mapped, or their unranked uploads.
	.get('/:id/countmapped/:status', rulesetParam, async c => {
		const character = c.get('character');
		const status = mappedStatus.parse(c.req.param('status'));
		return c.json(await countMapped(rulesetQuery(c, character), character.userId, status));
	})
	.get('/:id/mapped/:status/:page', rulesetParam, async c => {
		const character = c.get('character');
		const status = mappedStatus.parse(c.req.param('status'));
		const page = idParam.parse(c.req.param('page'));
		return c.json(await getMapped(rulesetQuery(c, character), character.userId, status, page));
	})
	// Admin: undo a skill's last upgrade - a misclick that bought one too many.
	.post('/:id/upgrade/rollback', requireAdmin, valid('json', rollbackBody), async c => {
		const character = c.get('character');
		const { id } = character;
		if (await isPlaying(id)) throw new HTTPException(409, { message: 'A play is in progress' });
		const { skill, anchor } = c.req.valid('json');
		await performUpgradeRevert(rulesetQuery(c, character), id, skill, anchor);
		await pushCharacter(id);
		return c.json({ ok: true });
	})
;

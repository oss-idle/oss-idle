import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	sql,
} from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import {
	type Context,
	Hono,
} from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	GOOD_GRADE,
	type GoodGrade,
} from '@oss-idle/shared/grade';

import { sessionUserId } from '../auth/middleware';
import { db } from '../db/client';
import {
	beatmapListColumns,
	beatmaps,
} from '../db/schema/beatmap';
import { characters } from '../db/schema/character';
import { users } from '../db/schema/user';
import {
	ProgressLines,
	progressOverview,
	progressPage,
} from '../medals';
import {
	gradesPage,
	medalsPage,
	PAGE_SIZE,
	playerCountries,
	ppPage,
	scorePage,
	skillPage,
} from '../rankings';
import {
	rulesetId,
	rulesetParam,
	rulesetQuery,
} from '../rulesets/request';
import {
	column,
	type ServerRuleset,
} from '../rulesets/ruleset';
import { friendCharacterIds } from '../social';
import {
	idParam,
	valid,
} from '../validate';


const isValidSkill = (
	r: ServerRuleset,
	str: string,
) => str === 'overall' || r.def.skills.includes(str);

export const skillRanking = (
	r: ServerRuleset,
	skill: string,
	page: number,
	country?: string,
	among?: number[],
) => {
	if (!isValidSkill(r, skill)) throw new HTTPException(400, { message: 'Invalid parameters' });
	return skillPage(r, skill, page, country, among);
};

const isValidGrade = (str: string): str is ('all' | GoodGrade) => 
	str === 'all' || str in GOOD_GRADE;

const gradesRanking = (
	r: ServerRuleset,
	grade: string,
	page: number,
	country?: string,
	among?: number[],
) => {
	if (!isValidGrade(grade)) throw new HTTPException(400, { message: 'Invalid parameters' });
	return gradesPage(r, grade, page, country, among);
};

/** The same skills, ranked on what they have ever earned rather than what they
 *  hold: `overall` is the summed column. */
const lifetimeRanking = (
	r: ServerRuleset,
	skill: string,
	page: number,
	country?: string,
	among?: number[],
) => {
	if (!isValidSkill(r, skill)) throw new HTTPException(400, { message: 'Invalid parameters' });
	return skillPage(r, `lifetime:${skill}`, page, country, among);
};

/** How many times each skill has been prestiged; `overall` is the total. */
const prestigeRanking = (
	r: ServerRuleset,
	skill: string,
	page: number,
	country?: string,
	among?: number[],
) => {
	if (!isValidSkill(r, skill)) throw new HTTPException(400, { message: 'Invalid parameters' });
	return skillPage(
		r, skill === 'overall' ? 'prestige:total' : `prestige:${skill}`, page, country, among,
	);
};

const total = (column: AnyMySqlColumn) => sql<number>`sum(${column})`.mapWith(Number);

/** Countries ranked on the summed pp of their players who have played ranked. */
export const countryPage = ({ def, profile, totals }: ServerRuleset, page: number) => db
	.select({
		country: users.country,
		players: sql<number>`count(*)`.mapWith(Number),
		playCount: total(totals.playCount),
		rankedScore: total(totals.rankedScore),
		pp: total(profile.pp),
		...Object.fromEntries(def.judgements.map(j => [j, total(column(totals, j))])) as
			Record<string, ReturnType<typeof total>>,
	})
	.from(characters)
	.innerJoin(profile, eq(profile.id, characters.id))
	.innerJoin(totals, eq(totals.id, characters.id))
	.innerJoin(users, eq(users.id, characters.userId))
	.where(and(gt(totals.playCount, 0), isNull(users.restrictedAt)))
	.groupBy(users.country)
	.orderBy(desc(total(profile.pp)))
	.limit(PAGE_SIZE)
	.offset((page - 1) * PAGE_SIZE);

/** Every player's best pp plays, highest first. */
const topPlaysPage = ({ bestPP }: ServerRuleset, page: number, among?: number[]) => db
	.select({
		score: bestPP,
		beatmap: beatmapListColumns,
		character: {
			id: characters.id, name: characters.name, country: users.country,
		},
	})
	// left alone, the planner starts from the small character table and sorts
	.from(bestPP, { forceIndex: 'pp_idx' })
	.innerJoin(beatmaps, eq(beatmaps.id, bestPP.beatmapId))
	.innerJoin(characters, eq(characters.id, bestPP.characterId))
	.innerJoin(users, eq(users.id, characters.userId))
	.where(and(
		isNull(users.restrictedAt),
		among && inArray(bestPP.characterId, among.length ? among : [0]),
	))
	.orderBy(desc(bestPP.pp), desc(bestPP.id))
	.limit(PAGE_SIZE)
	.offset((page - 1) * PAGE_SIZE);

/** `?friends=1` narrows a board to the signed-in player and their friends. */
const friendsQuery = valid('query', z.object({
	friends: z.literal('1').optional(), ruleset: rulesetId.optional(),
}));

const amongFor = async (c: Context): Promise<number[] | undefined> => {
	if (c.req.query('friends') !== '1') return undefined;
	const viewer = await sessionUserId(c);
	return viewer === undefined ? [] : friendCharacterIds(viewer);
};

const progressQuery = valid('query', z.object({
	friends: z.literal('1').optional(), country: z.string().optional(), ruleset: rulesetId.optional(),
}));

export const rankingRoutes = new Hono()
	.get('/country/:page', rulesetParam, async c => c.json(
		await countryPage(rulesetQuery(c), idParam.parse(c.req.param('page'))),
	))
	.get('/plays/:page', friendsQuery, async c => c.json(
		await topPlaysPage(rulesetQuery(c), idParam.parse(c.req.param('page')), await amongFor(c)),
	))
	.get('/countries', rulesetParam, async c => c.json(
		await playerCountries(rulesetQuery(c)),
	))
	.get('/global/:page', friendsQuery, async c => c.json(await ppPage(
		rulesetQuery(c),
		idParam.parse(c.req.param('page')),
		undefined,
		await amongFor(c),
	)))
	.get('/global/country/:country/:page', friendsQuery, async c => c.json(
		await ppPage(
			rulesetQuery(c),
			idParam.parse(c.req.param('page')), 
			c.req.param('country'),
			await amongFor(c)),
	))
	.get('/score/:page', friendsQuery, async c => c.json(
		await scorePage(rulesetQuery(c), idParam.parse(c.req.param('page')), undefined, await amongFor(c)),
	))
	.get('/score/country/:country/:page', friendsQuery, async c => c.json(
		await scorePage(
			rulesetQuery(c),
			idParam.parse(c.req.param('page')), 
			c.req.param('country'),
			await amongFor(c)),
	))
	.get('/medals/:page', friendsQuery, async c => c.json(
		await medalsPage(rulesetQuery(c), idParam.parse(c.req.param('page')), undefined, await amongFor(c)),
	))
	.get('/medals/country/:country/:page', friendsQuery, async c => c.json(
		await medalsPage(
			rulesetQuery(c),
			idParam.parse(c.req.param('page')),
			c.req.param('country'),
			await amongFor(c)),
	))
	.get('/progress', rulesetParam, async c => c.json(await progressOverview(rulesetQuery(c))))
	.get('/progress/:line/:page', progressQuery, async c => {
		const line = z.enum(ProgressLines).parse(c.req.param('line'));
		return c.json(await progressPage(
			rulesetQuery(c),
			line,
			idParam.parse(c.req.param('page')),
			PAGE_SIZE,
			c.req.valid('query').country,
			await amongFor(c),
		));
	})
	.get('/skill/:skill/page/:page', friendsQuery, async c => c.json(
		await skillRanking(
			rulesetQuery(c),
			c.req.param('skill'), 
			idParam.parse(c.req.param('page')),
			undefined,
			await amongFor(c),
		)))
	.get('/skill/:skill/country/:country/page/:page', friendsQuery, async c => c.json(
		await skillRanking(
			rulesetQuery(c),
			c.req.param('skill'), 
			idParam.parse(c.req.param('page')), 
			c.req.param('country'),
			await amongFor(c),
		),
	))
	.get('/lifetime/:skill/page/:page', friendsQuery, async c => c.json(
		await lifetimeRanking(
			rulesetQuery(c),
			c.req.param('skill'),
			idParam.parse(c.req.param('page')),
			undefined,
			await amongFor(c),
		)))
	.get('/lifetime/:skill/country/:country/page/:page', friendsQuery, async c => c.json(
		await lifetimeRanking(
			rulesetQuery(c),
			c.req.param('skill'),
			idParam.parse(c.req.param('page')),
			c.req.param('country'),
			await amongFor(c),
		)))
	.get('/prestige/:skill/page/:page', friendsQuery, async c => c.json(
		await prestigeRanking(
			rulesetQuery(c),
			c.req.param('skill'),
			idParam.parse(c.req.param('page')),
			undefined,
			await amongFor(c),
		)))
	.get('/prestige/:skill/country/:country/page/:page', friendsQuery, async c => c.json(
		await prestigeRanking(
			rulesetQuery(c),
			c.req.param('skill'),
			idParam.parse(c.req.param('page')),
			c.req.param('country'),
			await amongFor(c),
		)))
	.get('/grades/:grade/page/:page', friendsQuery, async c => c.json(
		await gradesRanking(
			rulesetQuery(c),
			c.req.param('grade'), 
			idParam.parse(c.req.param('page')),
			undefined,
			await amongFor(c),
		)))
	.get('/grades/:grade/country/:country/page/:page', friendsQuery, async c => c.json(
		await gradesRanking(
			rulesetQuery(c),
			c.req.param('grade'), 
			idParam.parse(c.req.param('page')), 
			c.req.param('country'),
			await amongFor(c),
		),
	))
;

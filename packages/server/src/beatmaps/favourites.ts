import {
	and,
	countDistinct,
	desc,
	eq,
	sql,
} from 'drizzle-orm';

import { db } from '../db/client';
import {
	MAP_PAGE,
	profilePage,
} from '../db/profilePage';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { favourites } from '../db/schema/favourite_beatmapset';
import type { ServerRuleset } from '../rulesets/ruleset';
import {
	panelColumns,
	setColumns,
	shownDiffCondition,
	shownStatusColumns,
	withStatus,
} from './catalog';

export const isFavourite = async (userId: number, setId: number) => {
	const [row] = await db.select({ setId: favourites.setId })
		.from(favourites)
		.where(and(eq(favourites.userId, userId), eq(favourites.setId, setId)))
		.limit(1);
	return !!row;
};

/** Favourite or unfavourite a set; its count after. */
export const setFavourite = (userId: number, setId: number, favourite: boolean) =>
	db.transaction(async tx => {
		const [{ affectedRows }] = favourite
			? await tx.insert(favourites).ignore().values({
				userId, setId,
			})
			: await tx.delete(favourites)
				.where(and(eq(favourites.userId, userId), eq(favourites.setId, setId)));
		if (affectedRows) {
			await tx.update(beatmapset)
				.set({ favouriteCount: sql`GREATEST(${beatmapset.favouriteCount} + ${favourite ? 1 : -1}, 0)` })
				.where(eq(beatmapset.id, setId));
		}
		const [row] = await tx.select({ count: beatmapset.favouriteCount })
			.from(beatmapset)
			.where(eq(beatmapset.id, setId));
		return row?.count ?? 0;
	});

const favouriteCondition = (r: ServerRuleset, userId: number) =>
	and(eq(favourites.userId, userId), shownDiffCondition(r));

export const countFavourites = async (r: ServerRuleset, userId: number) => {
	const [row] = await db.select({ n: countDistinct(beatmapset.id) })
		.from(favourites)
		.innerJoin(beatmapset, eq(beatmapset.id, favourites.setId))
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.where(favouriteCondition(r, userId));
	return row?.n ?? 0;
};

/** An account's favourites, latest favourited first. */
export const getFavourites = (r: ServerRuleset, userId: number, page: number) =>
	profilePage(page, (offset, limit) => db
		.select({
			...setColumns(r),
			...shownStatusColumns(r),
			...panelColumns(),
		})
		.from(favourites)
		.innerJoin(beatmapset, eq(beatmapset.id, favourites.setId))
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.where(favouriteCondition(r, userId))
		.groupBy(beatmapset.id, favourites.createdAt)
		.orderBy(desc(favourites.createdAt), desc(beatmapset.id))
		.offset(offset)
		.limit(limit), MAP_PAGE);

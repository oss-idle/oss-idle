import {
	and,
	countDistinct,
	desc,
	eq,
	or,
} from 'drizzle-orm';

import { db } from '../db/client';
import { profilePage } from '../db/profilePage';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import type { ServerRuleset } from '../rulesets/ruleset';
import {
	diffsOf,
	listCondition,
	listedAt,
	panelColumns,
	plannedCondition,
	setColumns,
	shownStatusColumns,
	withStatus,
} from './catalog';

/** Which of a user's own maps: the ranked or the loved ones they mapped, or their unranked
 *  uploads - planned ones among them until they go live. */
export type MappedStatus = 'ranked' | 'loved' | 'unranked';

const mappedCondition = (r: ServerRuleset, userId: number, status: MappedStatus) =>
	and(eq(beatmapset.ownerUserId, userId), status === 'unranked'
		? or(listCondition(r, status), and(plannedCondition(r), diffsOf(r)))
		: listCondition(r, status));

export const countMapped = async (r: ServerRuleset, userId: number, status: MappedStatus) => {
	const [row] = await db.select({ n: countDistinct(beatmapset.id) })
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.where(mappedCondition(r, userId, status));
	return row?.n ?? 0;
};

/** A user's own maps of a status, latest ranked or uploaded first. */
export const getMapped = (r: ServerRuleset, userId: number, status: MappedStatus, page: number) =>
	profilePage(page, (offset, limit) => db
		.select({
			...setColumns(r),
			...shownStatusColumns(r),
			...panelColumns(),
		})
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.where(mappedCondition(r, userId, status))
		.groupBy(beatmapset.id)
		.orderBy(desc(listedAt(r)), desc(beatmapset.id))
		.offset(offset)
		.limit(limit));

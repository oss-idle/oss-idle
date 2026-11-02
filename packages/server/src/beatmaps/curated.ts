import {
	and,
	countDistinct,
	desc,
	eq,
	isNull,
	or,
} from 'drizzle-orm';

import { OWNER_ID } from '@oss-idle/shared/groups';

import { db } from '../db/client';
import {
	MAP_PAGE,
	profilePage,
} from '../db/profilePage';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import type { ServerRuleset } from '../rulesets/ruleset';
import {
	listedCondition,
	panelColumns,
	setColumns,
	withStatus,
} from './catalog';

/** Ranked sets the account proposed. Adri also gets the sets nobody proposed (ranked
 *  from the nomination panel); sets submitted to oss!idle directly have no proposer. */
const curatedCondition = (r: ServerRuleset, userId: number) => and(
	listedCondition(r),
	userId === OWNER_ID
		? or(eq(r.requests.userId, userId), and(isNull(r.requests.setId), isNull(beatmapset.ownerUserId)))
		: eq(r.requests.userId, userId),
);

export const countCurated = async (r: ServerRuleset, userId: number) => {
	const [row] = await db.select({ n: countDistinct(beatmapset.id) })
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.leftJoin(r.requests, eq(r.requests.setId, beatmapset.osuId))
		.where(curatedCondition(r, userId));
	return row?.n ?? 0;
};

/** The account's ranked proposals, latest ranked first. */
export const getCurated = (r: ServerRuleset, userId: number, page: number) =>
	profilePage(page, (offset, limit) => db
		.select({
			...setColumns(r),
			...panelColumns(),
		})
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.leftJoin(r.requests, eq(r.requests.setId, beatmapset.osuId))
		.where(curatedCondition(r, userId))
		.groupBy(beatmapset.id)
		.orderBy(desc(r.setStatus.rankedAt), desc(beatmapset.id))
		.offset(offset)
		.limit(limit), MAP_PAGE);

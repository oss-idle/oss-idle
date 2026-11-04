import {
	index,
	mysqlTable,
} from 'drizzle-orm/mysql-core';

import { scoreColumns } from './score';

/** Plays on players' unranked maps that have a leaderboard: never ranked (no pp, no XP),
 *  wiped when the map is updated or ranked. Their DTOs say `unranked`. */
export const unrankedScoreTable = <J extends string>(name: string, judgements: readonly J[]) =>
	mysqlTable(name as 'unranked_score', scoreColumns(judgements), table => [
		index('unranked_score_beatmap_idx').on(table.beatmapId),
	]);

export type UnrankedScoreTable = ReturnType<typeof unrankedScoreTable<never>>;
export type UnrankedScoreRow = UnrankedScoreTable['$inferSelect'];

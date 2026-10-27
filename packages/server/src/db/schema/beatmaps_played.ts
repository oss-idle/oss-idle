import {
	and,
	count,
	desc,
	eq,
	isNotNull,
	sql,
} from 'drizzle-orm';
import {
	int,
	mysqlTable,
	primaryKey,
} from 'drizzle-orm/mysql-core';

import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { profilePage } from '../profilePage';
import {
	beatmapListColumns,
	beatmaps,
} from './beatmap';
import {
	beatmapset,
	setColumns,
} from './beatmapset';
import { characters } from './character';


export const playedTable = (name: string) => mysqlTable(name as 'beatmaps_played', {
	characterId: int().notNull()
		.references(() => characters.id, { onDelete: 'cascade' }),
	beatmapId: int().notNull()
		.references(() => beatmaps.id, { onDelete: 'cascade' }),
	plays: int().notNull().default(0),
	memory: int().notNull().default(0),
}, table => [
	primaryKey({ columns: [table.characterId, table.beatmapId] }),
]);

export type PlayedTable = ReturnType<typeof playedTable>;
export type BeatmapsPlayedRow = PlayedTable['$inferSelect'];


export const getMostPlayed = (
	r: ServerRuleset,
	characterId: number,
	page: number = 1,
) =>
	profilePage(page, (offset, limit) => db
		.select({
			beatmaps_played: r.played, beatmap: beatmapListColumns, beatmapset: setColumns(r),
		})
		.from(r.played)
		.innerJoin(beatmaps, eq(beatmaps.id, r.played.beatmapId))
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmapset.id))
		.where(eq(r.played.characterId, characterId))
		.orderBy(desc(r.played.plays))
		.offset(offset)
		.limit(limit));

export const getTotalPlayed = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
) => {
	return (await db
		.select({
			characterId: beatmaps_played.characterId,
			maps: count(),
		})
		.from(beatmaps_played)
		.where(eq(beatmaps_played.characterId, characterId))
		.groupBy(beatmaps_played.characterId))[0]?.maps ?? 0;
};

/** A character's plays per UTC month, oldest first, sparse. DATE_FORMAT keeps the
 *  month a string; a bare DATE() comes back as a JS Date and loses the calendar day. */
export const getPlayCounts = ({ score }: ServerRuleset, characterId: number) => {
	const month = sql<string>`DATE_FORMAT(${score.playedAt}, '%Y-%m')`;
	return db
		.select({
			d: month,
			plays: count(),
		})
		.from(score)
		.where(and(
			eq(score.characterId, characterId),
			isNotNull(score.playedAt),
		))
		.groupBy(month)
		.orderBy(month);
};

/** How many times this character has already played this map (0 if never).
 *  Read before a play to drive the memory skill. */
export const getPlays = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<number> => {
	const row = (await db
		.select({ plays: beatmaps_played.memory })
		.from(beatmaps_played)
		.where(
			and(
				eq(beatmaps_played.characterId, characterId), 
				eq(beatmaps_played.beatmapId, beatmapId),
			),
		))[0];
	return row?.plays ?? 0;
};

/** Forget every map this character has learned, without touching how many times
 *  they played it. Prestiging memory trades the training in for the bonus, so
 *  the maps are fresh to it again while `plays` keeps counting for the profile. */
export const resetMemory = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
) => {
	return db
		.update(beatmaps_played)
		.set({ memory: 0 })
		.where(eq(beatmaps_played.characterId, characterId));
};

/** A memory upgrade forgets some plays on every map, never below zero. */
export const forgetMemory = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	plays: number,
) => {
	return db
		.update(beatmaps_played)
		.set({ memory: sql`GREATEST(${beatmaps_played.memory} - ${plays}, 0)` })
		.where(eq(beatmaps_played.characterId, characterId));
};

export const addBeatmapPlayed = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
) => {
	await db.update(beatmaps)
		.set({ plays: sql`${beatmaps.plays} + 1` })
		.where(eq(beatmaps.id, beatmapId));

	return db
		.insert(beatmaps_played)
		.values({
			characterId,
			beatmapId,
			plays: 1,
			memory: 1,
		})
		.onDuplicateKeyUpdate({
			set: {
				plays: sql`${beatmaps_played.plays} + 1`,
				memory: sql`${beatmaps_played.memory} + 1`,
			},
		})
	;
};
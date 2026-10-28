import {
	and,
	count,
	desc,
	eq,
	gt,
	sql,
} from 'drizzle-orm';
import {
	double,
	int,
	mysqlTable,
	primaryKey,
	timestamp,
} from 'drizzle-orm/mysql-core';

import {
	DAILY_DECAY,
	DAY_MS,
} from '@oss-idle/shared/rulesets/mania/memoryRecall';

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
	// plays that still train memory as of memoryAt, fading by DAILY_DECAY a day;
	// declared first so an update decays it before moving memoryAt
	memory: double().notNull().default(0),
	memoryAt: timestamp().notNull().defaultNow(),
}, table => [
	primaryKey({ columns: [table.characterId, table.beatmapId] }),
]);

export type PlayedTable = ReturnType<typeof playedTable>;
export type BeatmapsPlayedRow = PlayedTable['$inferSelect'];

/** The memory plays left now, after the fade since memoryAt. */
const memoryNow = (played: PlayedTable) => sql<number>`${played.memory} * POW(
	${1 - DAILY_DECAY}, TIMESTAMPDIFF(SECOND, ${played.memoryAt}, NOW()) / ${DAY_MS / 1000}
)`;


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
		.where(and(eq(r.played.characterId, characterId), gt(r.played.plays, 0)))
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
		.where(and(eq(beatmaps_played.characterId, characterId), gt(beatmaps_played.plays, 0)))
		.groupBy(beatmaps_played.characterId))[0]?.maps ?? 0;
};

/** The plays of this map that still train memory (0 if never played): read
 *  before a play to drive the memory skill. */
export const getPlays = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<number> => {
	const row = (await db
		.select({ plays: memoryNow(beatmaps_played).mapWith(Number) })
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
		.set({
			memory: 0, memoryAt: sql`NOW()`,
		})
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
		.set({
			memory: sql`GREATEST(${memoryNow(beatmaps_played)} - ${plays}, 0)`, memoryAt: sql`NOW()`,
		})
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
				memory: sql`${memoryNow(beatmaps_played)} + 1`,
				memoryAt: sql`NOW()`,
			},
		})
	;
};

/** A failed play trains memory up to where it got: `share` of a play. Only passes
 *  count as plays, so a map only ever failed stays out of the played lists. */
export const addMemory = (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
	share: number,
) => db
	.insert(beatmaps_played)
	.values({
		characterId,
		beatmapId,
		memory: share,
	})
	.onDuplicateKeyUpdate({
		set: {
			memory: sql`${memoryNow(beatmaps_played)} + ${share}`,
			memoryAt: sql`NOW()`,
		},
	});

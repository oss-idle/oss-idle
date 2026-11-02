import {
	eq,
	getTableColumns,
} from 'drizzle-orm';
import {
	boolean,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
} from 'drizzle-orm/mysql-core';

import { BEATMAP_STATUS } from '@oss-idle/shared/beatmap';

import { db } from '../client';

export const beatmapset = mysqlTable('beatmapset', {
	id: int().primaryKey().autoincrement(),
	// osu!'s set id, when the map has one
	osuId: int().unique(),
	// osu! serves covers for it (an old set can have none): else our own background
	osuCover: boolean().notNull().default(true),
	artist: text().notNull(),
	title: text().notNull(),
	creator: text().notNull(),
	// Deleted from the queue: rows kept so a re-upload gets the same ids back.
	deletedAt: timestamp(),
	// The player who made the set: the uploader of an `unranked` one (the only one who
	// can replace it), the mapper of one taken from osu!.
	ownerUserId: int(),
	// When the set was first uploaded (submittedAt moves when it enters the queue).
	createdAt: timestamp().notNull().defaultNow(),
	// When a player last uploaded it: set on the sets players manage - their uploads,
	// and a map from osu! its mapper took over - and on no other.
	uploadedAt: timestamp(),
	// Listed in everyone's song select; otherwise downloaded from the site first.
	bundled: boolean().notNull().default(false),
	// its tags were reviewed: off the nomination page's "to categorize" queue
	categorized: boolean().notNull().default(false),
	// players who favourited it (favourite_beatmapset), kept here like osu!'s
	favouriteCount: int().notNull().default(0),
}, table => [index('beatmapset_owner_idx').on(table.ownerUserId)]);

/** A set's status in one ruleset: ranking there says nothing of another ruleset. */
export const setStatusTable = (name: string) => mysqlTable(name as 'beatmapset_status', {
	setId: int().primaryKey()
		.references(() => beatmapset.id, { onDelete: 'cascade' }),
	// 'pending' = uploaded, not scheduled; 'ranked' = scheduled/live (live once
	// rankedAt has passed); 'rejected' = pulled from the nomination queue;
	// 'unranked' = a player's own upload; 'loved' = like ranked, but no pp.
	status: mysqlEnum(BEATMAP_STATUS).notNull().default('pending'),
	// The scheduled rank time. Null until scheduled; a set is live (downloadable,
	// listed) only when status is 'ranked' or 'loved' AND rankedAt <= now().
	rankedAt: timestamp(),
	// Set true by the rank sweep once the "now ranked" webhook has fired, so it
	// announces each map exactly once when its rankedAt passes.
	announced: boolean().notNull().default(false),
	// When the set entered the queue (uploaded / submitted). Drives the
	// nomination list's sort.
	submittedAt: timestamp().notNull().defaultNow(),
	// An unranked set's leaderboard, opened for good by a supporter uploading or playing it.
	leaderboard: boolean().notNull().default(false),
	// Why an admin sent a player's submission back.
	reviewNote: text(),
});

export type SetStatusTable = ReturnType<typeof setStatusTable>;
export type SetStatusRow = SetStatusTable['$inferSelect'];

export type BeatmapsetRow = typeof beatmapset.$inferSelect;

/** A set's own columns and its status in a ruleset, as the set rows the site reads. */
export const setColumns = ({ setStatus }: { setStatus: SetStatusTable }) => ({
	...getTableColumns(beatmapset),
	status: setStatus.status,
	rankedAt: setStatus.rankedAt,
	announced: setStatus.announced,
	submittedAt: setStatus.submittedAt,
	leaderboard: setStatus.leaderboard,
	reviewNote: setStatus.reviewNote,
});

/** A set as the site reads it in one ruleset. */
export type RulesetSetRow = BeatmapsetRow & Omit<SetStatusRow, 'setId'>;
export type NewBeatmapsetRow = typeof beatmapset.$inferInsert;


export const getBeatmapsetById = async (id: number) => {
	const [row] = await db
		.select()
		.from(beatmapset)
		.where(eq(beatmapset.id, id))
		.limit(1);
	return row;
};
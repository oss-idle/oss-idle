import {
	eq,
	getTableColumns,
} from 'drizzle-orm';
import {
	boolean,
	char,
	decimal,
	index,
	int,
	json,
	longtext,
	mysqlTable,
	text,
	varchar,
} from 'drizzle-orm/mysql-core';

import { db } from '../client';

export const beatmaps = mysqlTable('beatmap', {
	id: int().primaryKey().autoincrement(),
	// osu!'s beatmap id, when the map has one
	osuId: int().unique(),
	setId: int().notNull(),
	// its .osu inside the set's .osz
	file: text(),
	sr: decimal({
		precision: 10, scale: 3, 
	}).notNull(),
	// the stars at every other rate, by rateKey; filled at ingest, backfilled at boot
	rateStars: json().$type<Record<string, number>>(),
	artist: text().notNull(),
	title: text().notNull(),
	version: text().notNull(),
	keys: int().notNull(),
	// Playable length in milliseconds (matches gameplay HitObject times).
	total_length: int().notNull(),
	chart: longtext().notNull(),
	// sha256 of the chart without its BOM: the game's copy is outdated when its own differs.
	// Set by triggers (0125), never by the app.
	checksum: char({ length: 64 }).notNull().default(''),
	plays: int().notNull().default(0),
	// Rich per-difficulty metadata for the catalog (previously only in the client
	// manifest). bpm is rounded; objects/rice/ln are note counts; mode is the
	// osu! ruleset (3 = mania). audio/background are the preview asset filenames
	// served under /v1/beatmap/preview/:setId (null when the map has none).
	bpm: int().notNull().default(0),
	objects: int().notNull().default(0),
	rice: int().notNull().default(0),
	ln: int().notNull().default(0),
	// timing line counts, filled at ingest, backfilled at boot
	bpmPoints: int(),
	svPoints: int(),
	mode: int().notNull().default(3),
	audio: text(),
	background: text(),
	// Per-difficulty inclusion: the set's status/rankedAt still drive *when* the
	// set goes live, but only ranked diffs are listed, downloadable and playable
	// ranked. Toggled from the nomination page, before or after the set is live.
	ranked: boolean().notNull().default(true),
	// MAP_TAGS, comma-separated, set by hand from the nomination page
	tags: varchar({ length: 64 }).notNull().default(''),
}, table => [index('beatmap_set_idx').on(table.setId)]);

/** Every column but `chart`, for lists that only show map info. */
export const beatmapListColumns = Object.fromEntries(
	Object.entries(getTableColumns(beatmaps)).filter(([key]) => key !== 'chart'),
) as Omit<ReturnType<typeof getTableColumns<typeof beatmaps>>, 'chart'>;

export type BeatmapRow = typeof beatmaps.$inferSelect;
export type NewBeatmapRow = typeof beatmaps.$inferInsert;


export const getBeatmapById = async (id: number) => {
	const [row] = await db
		.select()
		.from(beatmaps)
		.where(eq(beatmaps.id, id))
		.limit(1);
	return row;
};
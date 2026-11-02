import {
	and,
	asc,
	count,
	desc,
	eq,
	max,
	min,
	sql,
} from 'drizzle-orm';
import {
	float,
	int,
	mysqlTable,
	tinytext,
} from 'drizzle-orm/mysql-core';
import {
	drizzle,
	type MySql2Database,
} from 'drizzle-orm/mysql2';
import {
	createPool,
	type Pool,
	type RowDataPacket,
} from 'mysql2';

import { env } from '../env';
import { chartsOf } from '../rulesets/enabled';
import type { ServerRuleset } from '../rulesets/ruleset';

/**
 * Read-only window onto the farm's `stats` database, which already mirrors every
 * ranked/loved beatmap on osu!. It backs the request form's search box, so a
 * player picks a real map instead of pasting an id blind. Its schema belongs to
 * another project: never written to, never migrated from here (drizzle-kit only
 * globs `db/schema/*.ts`).
 */

export const osuAllBeatmaps = mysqlTable('osu_allbeatmaps', {
	beatmapId: int().primaryKey(),
	beatmapsetId: int().notNull(),
	mode: int().notNull(),
	artist: tinytext().notNull(),
	creator: tinytext().notNull(),
	difficultyrating: float().notNull(),
	// osu! stores the mania key count in the circle-size column.
	diffSize: float().notNull(),
	title: tinytext().notNull(),
	version: tinytext().notNull(),
	approved: int().notNull(),
});

const statsPool: Pool = createPool({
	host: env.STATS_DB_HOST ?? env.DB_HOST,
	port: env.DB_PORT,
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.STATS_DB_NAME,
	timezone: 'Z',
	connectionLimit: 2,
	maxIdle: 1,
	idleTimeout: 60_000,
});

/** A raw query on the farm's server (the `stats` and `farm` databases), which is not
 *  always the one holding oss!idle's own. */
export const farmQuery = async (query: string, args: unknown[]): Promise<RowDataPacket[]> =>
	(await statsPool.promise().query<RowDataPacket[]>(query, args))[0];

const statsDb: MySql2Database<Record<string, never>> = drizzle(statsPool, {
	mode: 'default',
	casing: 'snake_case',
});

// Only what the ruleset plays is offered. Every osu!
// status is searchable though - a graveyard map is as rankable here as a ranked
// one, and anything the mirror doesn't carry can still be submitted by id.
const searchable = (r: ServerRuleset) =>
	chartsOf(r.def.id, osuAllBeatmaps.mode, osuAllBeatmaps.diffSize);

export type BeatmapsetHit = {
	setId: number;
	artist: string;
	title: string;
	creator: string;
	diffs: number;
	srMin: number;
	srMax: number;
	// osu!'s own status: 4 loved, 3 qualified, 2 approved, 1 ranked, 0 pending,
	// -1 WIP, -2 graveyard. Shown on the card, never used to exclude a map.
	approved: number;
};

/**
 * Search 4K mania sets by artist / title / creator. Every word must appear
 * somewhere in the set's metadata, so "camellia freedom" finds the map the way a
 * player would type it. Results are one row per set, the maps osu! itself ranked
 * or loved first, then the newest.
 */
export const searchManiaSets = async (
	r: ServerRuleset,
	query: string,
	limit = 12,
): Promise<BeatmapsetHit[]> => {
	const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
	if (!words.length) return [];

	// The mirror's text columns are utf8mb3_bin, so a plain LIKE is case
	// sensitive - "identity" would miss "Identity Part 4". Fold both sides.
	const haystack = sql`lower(concat_ws(' ',
		${osuAllBeatmaps.artist},
		${osuAllBeatmaps.title},
		${osuAllBeatmaps.creator}))`;
	const matches = words.map(word => sql`${haystack} like ${`%${word.toLowerCase()}%`}`);

	const approved = max(osuAllBeatmaps.approved).as('approved');

	const rows = await statsDb
		.select({
			setId: osuAllBeatmaps.beatmapsetId,
			artist: max(osuAllBeatmaps.artist),
			title: max(osuAllBeatmaps.title),
			creator: max(osuAllBeatmaps.creator),
			diffs: count(),
			srMin: min(osuAllBeatmaps.difficultyrating),
			srMax: max(osuAllBeatmaps.difficultyrating),
			approved,
		})
		.from(osuAllBeatmaps)
		.where(and(searchable(r), ...matches))
		.groupBy(osuAllBeatmaps.beatmapsetId)
		.orderBy(desc(approved), desc(osuAllBeatmaps.beatmapsetId))
		.limit(limit);

	return rows.map(row => ({
		setId: row.setId,
		artist: row.artist ?? '',
		title: row.title ?? '',
		creator: row.creator ?? '',
		diffs: row.diffs,
		srMin: Number(row.srMin ?? 0),
		srMax: Number(row.srMax ?? 0),
		approved: Number(row.approved ?? 0),
	}));
};

/** The ruleset's difficulties of one set, cheapest source for a request preview. */
export const getManiaSet = async (
	r: ServerRuleset,
	setId: number,
): Promise<BeatmapsetHit | undefined> => {
	const rows = await statsDb
		.select({
			artist: osuAllBeatmaps.artist,
			title: osuAllBeatmaps.title,
			creator: osuAllBeatmaps.creator,
			sr: osuAllBeatmaps.difficultyrating,
			approved: osuAllBeatmaps.approved,
		})
		.from(osuAllBeatmaps)
		.where(and(searchable(r), eq(osuAllBeatmaps.beatmapsetId, setId)))
		.orderBy(asc(osuAllBeatmaps.difficultyrating));

	if (!rows.length) return undefined;
	return {
		setId,
		artist: rows[0].artist,
		title: rows[0].title,
		creator: rows[0].creator,
		diffs: rows.length,
		srMin: rows[0].sr,
		srMax: rows[rows.length - 1].sr,
		approved: rows[0].approved,
	};
};

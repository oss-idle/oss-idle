import {
	and,
	desc,
	eq,
} from 'drizzle-orm';
import {
	type AnyMySqlColumn,
	boolean,
	decimal,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	primaryKey,
	smallint,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';

import {
	compareGradeGT,
	type Grade,
	Grades,
} from '@oss-idle/shared/grade';
import { parseMods } from '@oss-idle/shared/mods';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';
import type { ScoreDTO } from '@oss-idle/shared/score';

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

const judgeColumn = () => int().notNull().default(0);

/** A count column per judgement of the ruleset. */
export const judgeColumns = <J extends string>(judgements: readonly J[]) => Object.fromEntries(
	judgements.map(judge => [judge, judgeColumn()]),
) as { [K in J]: ReturnType<typeof judgeColumn> };

export const scoreColumns = <J extends string>(judgements: readonly J[]) => ({
	id: int().autoincrement().primaryKey(),
	characterId: int().notNull()
		.references(() => characters.id, { onDelete: 'cascade' }),
	// Plain id (no FK): imported scores can reference beatmaps not yet in the
	// server `beatmap` table.
	beatmapId: int().notNull(),
	score: int().notNull(),
	accuracy: decimal({
		precision: 10, scale: 5, 
	}).notNull(),
	maxCombo: int().notNull(),
	...judgeColumns(judgements),
	grade: mysqlEnum(Grades).notNull(),
	pp: decimal({
		precision: 10, scale: 3, 
	}).notNull(),
	ur: decimal({
		precision: 10, scale: 3, 
	}).notNull(),
	pfc: boolean().notNull(),
	playedAt: timestamp().defaultNow(),
	rate: decimal({
		precision: 3, scale: 2,
	}).notNull().default('1.00'),
	// the stars at that rate; null on plays from before rates
	sr: decimal({
		precision: 10, scale: 3,
	}),
	// modsKey: "HR,SD"
	mods: varchar({ length: 16 }).notNull().default(''),
	// the score version the play was simulated on (sim.ts SCORE_VERSION): the reprocessor brings older ones up
	version: smallint().notNull().default(1),
});

type ScoreCols = { characterId: AnyMySqlColumn; beatmapId: AnyMySqlColumn };

// Shared across a ruleset's score / best / best_pp tables: index names are
// table-scoped in MySQL, so reuse is fine. `score` keeps a plain index - a
// character can have many plays per beatmap.
export const scoreIndexes = (table: ScoreCols & { playedAt: AnyMySqlColumn }) => [
	index('character_beatmap_idx').on(table.characterId, table.beatmapId),
	index('beatmap_idx').on(table.beatmapId),
	// Recent-scores feed: filter by character, read in playedAt order so the
	// LIMIT is served from the index instead of a filesort over every play.
	index('character_playedat_idx').on(table.characterId, table.playedAt),
];

/** A ruleset's plays. */
export const scoreTable = <J extends string>(name: string, judgements: readonly J[]) =>
	mysqlTable(name as 'score', scoreColumns(judgements), scoreIndexes);

/** The columns every ruleset's score table has: what code outside the rulesets reads. */
export type ScoreTable = ReturnType<typeof scoreTable<never>>;

// `best` / `best_pp` hold at most one row per (character, beatmap), so that
// composite is their primary key. Their `id` is not autoincrement - it points
// at the winning row in `score`.
export const bestColumns = <J extends string>(
	judgements: readonly J[],
	scores: { id: AnyMySqlColumn },
) => ({
	...scoreColumns(judgements),
	id: int().notNull().references(() => scores.id, { onDelete: 'cascade' }),
});

export const bestConstraints = (table: ScoreCols) => [
	primaryKey({ columns: [table.characterId, table.beatmapId] }),
	index('beatmap_idx').on(table.beatmapId),
];

export type ScoreRow = ScoreTable['$inferSelect'];
export type NewScoreRow = ScoreTable['$inferInsert'];

/** A row's judgement counts, read by its ruleset's judgements. */
export const judgementsOf = (row: ScoreRow, def: RulesetDef) =>
	Object.fromEntries(def.judgements.map(j => [j, (row as Record<string, unknown>)[j] as number]));

export function toScoreDTO(row: ScoreRow, def: RulesetDef): ScoreDTO {
	return {
		id: row.id,
		beatmapId: row.beatmapId,
		characterId: row.characterId,
		grade: row.grade,
		maxCombo: row.maxCombo,
		pfc: row.pfc,
		score: row.score,
		judgements: judgementsOf(row, def),
		accuracy: parseFloat(row.accuracy),
		pp: parseFloat(row.pp),
		ur: parseFloat(row.ur),
		rate: parseFloat(row.rate),
		mods: parseMods(row.mods),
		playedAt: row.playedAt ? row.playedAt.getTime() : 0,
	};
}

/** The best grade a character ever set on a map, at any rate: a slowed play's cut score
 *  never makes it the best, so the best row's grade can sit below it. */
export const bestGradeOn = async (
	{ score }: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<Grade | undefined> => {
	const rows = await db
		.selectDistinct({ grade: score.grade })
		.from(score)
		.where(and(eq(score.characterId, characterId), eq(score.beatmapId, beatmapId)));
	return rows.reduce<Grade | undefined>(
		(top, { grade }) => (!top || compareGradeGT(grade, top) ? grade : top), undefined,
	);
};

export const getScoreById = async ({ score }: ServerRuleset, id: number) => {
	const [row] = await db
		.select()
		.from(score)
		.where(eq(score.id, id))
		.limit(1);
	return row;
};

export const getCharacterScores = (
	{ score }: ServerRuleset,
	characterId: number,
	beatmapId: number,
) => db
	.select()
	.from(score)
	.where(
		and(
			eq(score.characterId, characterId),
			eq(score.beatmapId, beatmapId),
		));

export const getAllCharacterScores = ({ score }: ServerRuleset, characterId: number) => db
	.select()
	.from(score)
	.where(eq(score.characterId, characterId));
	
export const recentScoreRows = (
	r: ServerRuleset,
	characterId: number,
	offset: number,
	limit: number,
) => db
	.select({
		score: r.score, beatmap: beatmapListColumns, beatmapset: setColumns(r),
	})
	.from(r.score)
	.innerJoin(beatmaps, eq(beatmaps.id, r.score.beatmapId))
	.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
	.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmapset.id))
	.where(eq(r.score.characterId, characterId))
	.orderBy(desc(r.score.playedAt))
	.offset(offset)
	.limit(limit);

export const getRecentCharacterScores = (t: ServerRuleset, characterId: number, page: number = 1) =>
	profilePage(page, (offset, limit) => recentScoreRows(t, characterId, offset, limit));

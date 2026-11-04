import {
	eq,
	sql,
} from 'drizzle-orm';
import {
	bigint,
	int,
	mysqlTable,
} from 'drizzle-orm/mysql-core';

import {
	type Grade,
	Grades,
} from '@oss-idle/shared/grade';

import {
	column,
	type ServerRuleset,
} from '../../rulesets/ruleset';
import { db } from '../client';
import { beatmaps } from './beatmap';
import { characters } from './character';

const totalColumn = () => bigint({ mode: 'number' }).notNull().default(0);

const gradesColumns = Grades.reduce((acc, j) => {
	acc[j] = totalColumn();
	return acc;
}, {} as Record<Grade, ReturnType<typeof totalColumn>>);

/** A ruleset's lifetime sums per character, a judgement column per judgement. */
export const totalsTable = <J extends string>(name: string, judgements: readonly J[]) =>
	mysqlTable(name as 'character_totals', {
		id: int().notNull()
			.references(() => characters.id, { onDelete: 'cascade' }),
		totalScore: totalColumn(),
		rankedScore: totalColumn(),
		hits: totalColumn(),
		playCount: totalColumn(),
		playTime: totalColumn(),
		...Object.fromEntries(judgements.map(j => [j, totalColumn()])) as
			{ [K in J]: ReturnType<typeof totalColumn> },
		...gradesColumns,
	});

export type TotalsTable = ReturnType<typeof totalsTable<never>>;

export type CharacterTotalsRow = TotalsTable['$inferSelect'];


type On = Pick<typeof db, 'execute'>;

const hitsOf = ({ def, score: scores }: ServerRuleset) => sql.join(
	def.judgements.filter(j => j !== def.miss).map(j => sql`${column(scores, j)}`), sql` + `,
);

const secondsOf = ({ score: scores }: ServerRuleset) =>
	sql`ROUND(${beatmaps.total_length} / 1000 / ${scores.rate})`;

/** The sums of a character's bests as `p` (one row per map), and the totals they set. */
const bestSums = ({ def, best, totals: character_totals }: ServerRuleset, characterId: number) => ({
	from: sql`(
		SELECT COALESCE(SUM(${best.score}), 0) ranked
			${sql.join(def.judgements.map(j => sql`, COALESCE(SUM(${column(best, j)}), 0) ${sql.raw(j)}`))}
			${sql.join(Grades.map(g => sql`, COALESCE(SUM(${best.grade} = ${g}), 0) ${sql.raw(`grade_${g}`)}`))}
		FROM ${best} WHERE ${best.characterId} = ${characterId}
	) p`,
	set: sql`${character_totals.rankedScore} = p.ranked
		${sql.join(def.judgements.map(j => sql`, ${column(character_totals, j)} = p.${sql.raw(j)}`))}
		${sql.join(Grades.map(g => sql`, ${character_totals[g]} = p.${sql.raw(`grade_${g}`)}`))}`,
});

/** Recompute a character's totals from all its scores and its bests, in one statement:
 *  for anything that deletes or rewrites scores. */
export const refreshCharacterTotals = async (
	r: ServerRuleset,
	characterId: number,
	on: On = db,
) => {
	const { score: scores, totals: character_totals } = r;
	const p = bestSums(r, characterId);
	await on.execute(sql`
		UPDATE ${character_totals},
			(
				SELECT COUNT(*) plays, COALESCE(SUM(${scores.score}), 0) total,
					COALESCE(SUM(${hitsOf(r)}), 0) hits,
					COALESCE(SUM(${secondsOf(r)}), 0) time
				FROM ${scores} LEFT JOIN ${beatmaps} ON ${beatmaps.id} = ${scores.beatmapId}
				WHERE ${scores.characterId} = ${characterId}
			) a,
			${p.from}
		SET ${character_totals.playCount} = a.plays, ${character_totals.totalScore} = a.total,
			${character_totals.hits} = a.hits, ${character_totals.playTime} = a.time,
			${p.set}
		WHERE ${character_totals.id} = ${characterId}
	`);
};

/** Add a new score to its character's totals. Run in the transaction that inserts it,
 *  so a submit that stops halfway never counts it twice or not at all. */
export const addScoreToTotals = async (r: ServerRuleset, scoreId: number, on: On = db) => {
	const { score: scores, totals: character_totals } = r;
	await on.execute(sql`
		UPDATE ${character_totals}
			JOIN ${scores} ON ${scores.characterId} = ${character_totals.id}
			LEFT JOIN ${beatmaps} ON ${beatmaps.id} = ${scores.beatmapId}
		SET ${character_totals.playCount} = ${character_totals.playCount} + 1,
			${character_totals.totalScore} = ${character_totals.totalScore} + ${scores.score},
			${character_totals.hits} = ${character_totals.hits} + ${hitsOf(r)},
			${character_totals.playTime} = ${character_totals.playTime} + COALESCE(${secondsOf(r)}, 0)
		WHERE ${scores.id} = ${scoreId}
	`);
};

/** Recompute the totals read from a character's bests, after a best changed. */
export const refreshBestTotals = async (r: ServerRuleset, characterId: number, on: On = db) => {
	const p = bestSums(r, characterId);
	await on.execute(sql`
		UPDATE ${r.totals}, ${p.from}
		SET ${p.set}
		WHERE ${r.totals.id} = ${characterId}
	`);
};

export const getCharacterTotals = async (t: ServerRuleset, characterId: number) => {
	const { totals: character_totals } = t;
	const read = () => db
		.select()
		.from(character_totals)
		.where(eq(character_totals.id, characterId))
		.limit(1);
	let [row] = await read();
	if (!row) {
		await db.insert(character_totals).values({ id: characterId });
		await refreshCharacterTotals(t, characterId);
		[row] = await read();
		if (!row) throw new Error('Could not insert character totals ! ' + characterId);
	}
	return row;
};

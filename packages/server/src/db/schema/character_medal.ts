import {
	and,
	desc,
	eq,
	inArray,
} from 'drizzle-orm';
import {
	int,
	mysqlTable,
	primaryKey,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';

import type { MedalBatch } from '@oss-idle/shared/play';

import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { characters } from './character';

/** The medals a character holds. Never removed in play: a medal stays earned even
 *  if what earned it is lost (a #1 taken back, a map unranked). Only a score reprocess
 *  takes back the ones its replayed scores no longer earn (medals.ts `scores`). */
export const medalsTable = (name: string) => mysqlTable(name as 'character_medal', {
	characterId: int().notNull()
		.references(() => characters.id, { onDelete: 'cascade' }),
	medalId: varchar({ length: 32 }).notNull(),
	unlockedAt: timestamp().notNull().defaultNow(),
}, table => [
	primaryKey({ columns: [table.characterId, table.medalId] }),
]);

export type MedalsTable = ReturnType<typeof medalsTable>;

/** Newest first. */
export const getMedals = async (
	{ medals: characterMedals }: ServerRuleset,
	characterId: number,
) => db
	.select()
	.from(characterMedals)
	.where(eq(characterMedals.characterId, characterId))
	.orderBy(desc(characterMedals.unlockedAt));

/** Store the medals among `ids` the character did not hold yet; returns those,
 *  and how many it holds now. */
export const addMedals = async (
	t: ServerRuleset,
	characterId: number,
	ids: string[],
): Promise<MedalBatch> => {
	const { medals: characterMedals } = t;
	const held = new Set((await getMedals(t, characterId)).map(m => m.medalId));
	const fresh = ids.filter(id => !held.has(id));
	if (!fresh.length) return {
		ids: [], held: held.size,
	};
	// two workers racing to award the same medal: the primary key keeps one
	await db.insert(characterMedals)
		.ignore()
		.values(fresh.map(medalId => ({
			characterId, medalId,
		})));
	return {
		ids: fresh, held: held.size + fresh.length,
	};
};

/** Take medals back: only a score reprocess does. */
export const removeMedals = async (
	{ medals: characterMedals }: ServerRuleset,
	characterId: number,
	ids: string[],
) => {
	if (!ids.length) return;
	await db.delete(characterMedals)
		.where(and(eq(characterMedals.characterId, characterId), inArray(characterMedals.medalId, ids)));
};

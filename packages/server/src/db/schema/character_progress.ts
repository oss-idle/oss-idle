import {
	double,
	int,
	mysqlTable,
	primaryKey,
	varchar,
} from 'drizzle-orm/mysql-core';

import { bigColumn } from './bigColumn';
import { characters } from './character';

/** The best value each character ever reached on a medal line, so a lost #1 or
 *  a prestige never takes a place on the progress boards back. */
export const progressTable = (name: string) => mysqlTable(name as 'character_progress', {
	characterId: int().notNull()
		.references(() => characters.id, { onDelete: 'cascade' }),
	line: varchar({ length: 16 }).notNull(),
	value: bigColumn(),
	current: bigColumn(),
	/** `rankScore(value)`, what the boards sort on. After `value`: an upsert sets columns in this order */
	rankScore: double().notNull()
		.default(0),
}, table => [
	primaryKey({ columns: [table.characterId, table.line] }),
]);

export type ProgressTable = ReturnType<typeof progressTable>;

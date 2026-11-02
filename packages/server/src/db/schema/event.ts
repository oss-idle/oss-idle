import {
	index,
	int,
	mysqlTable,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';

import type {
	EventData,
	EventType,
} from '@oss-idle/shared/events';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { jsonColumn } from '../columns';
import { characters } from './character';
import { users } from './user';

/** osu!web's profile events: an account's, or one of its characters' in a ruleset. */
export const events = mysqlTable('event', {
	id: int().autoincrement().primaryKey(),
	userId: int().notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	characterId: int()
		.references(() => characters.id, { onDelete: 'cascade' }),
	ruleset: varchar({ length: 16 }).$type<RulesetId>(),
	type: varchar({ length: 32 }).$type<EventType>().notNull(),
	data: jsonColumn<Omit<EventData, 'type'>>().notNull(),
	createdAt: timestamp().notNull().defaultNow(),
}, table => [
	index('event_user_idx').on(table.userId, table.createdAt),
]);

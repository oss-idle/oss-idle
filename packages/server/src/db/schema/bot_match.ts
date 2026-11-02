import {
	int,
	json,
	mysqlEnum,
	mysqlTable,
	timestamp,
} from 'drizzle-orm/mysql-core';

import {
	BOT_MATCH_FAILURE,
	BOT_MATCH_STATUS,
	type BotMatchResult,
} from '@oss-idle/shared/botMatch';

import { users } from './user';

/** A player's bot match: one per account, the last finished result kept through a new run. */
export const botMatches = mysqlTable('bot_match', {
	userId: int().primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	status: mysqlEnum(BOT_MATCH_STATUS).notNull().default('queued'),
	failure: mysqlEnum(BOT_MATCH_FAILURE),
	requestedAt: timestamp().notNull().defaultNow(),
	finishedAt: timestamp(),
	result: json().$type<BotMatchResult>(),
});

export type BotMatchRow = typeof botMatches.$inferSelect;

import {
	int,
	mysqlEnum,
	mysqlTable,
	primaryKey,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';

import { GROUPS } from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { users } from './user';

/** An account's membership of one group, set by an admin from the team page. */
export const userGroups = mysqlTable('user_group', {
	userId: int().notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	group: mysqlEnum(GROUPS).notNull(),
	createdAt: timestamp().notNull().defaultNow(),
}, table => [
	primaryKey({ columns: [table.userId, table.group] }),
]);

/** The rulesets a Beatmap Nominator ranks maps in, set by an admin from the team page. */
export const userNominates = mysqlTable('user_nominates', {
	userId: int().notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	ruleset: varchar({ length: 16 }).$type<RulesetId>().notNull(),
}, table => [
	primaryKey({ columns: [table.userId, table.ruleset] }),
]);

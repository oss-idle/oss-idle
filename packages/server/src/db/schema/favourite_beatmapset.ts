import {
	index,
	int,
	mysqlTable,
	primaryKey,
	timestamp,
} from 'drizzle-orm/mysql-core';

import { beatmapset } from './beatmapset';
import { users } from './user';

/** A set an account favourited, osu!'s favourite_beatmapsets. */
export const favourites = mysqlTable('favourite_beatmapset', {
	userId: int().notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	setId: int().notNull()
		.references(() => beatmapset.id, { onDelete: 'cascade' }),
	createdAt: timestamp().notNull().defaultNow(),
}, table => [
	primaryKey({ columns: [table.userId, table.setId] }),
	index('favourite_beatmapset_user_idx').on(table.userId, table.createdAt),
]);

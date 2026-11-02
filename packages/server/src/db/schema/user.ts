import { eq } from 'drizzle-orm';
import {
	boolean,
	datetime,
	int,
	mysqlTable,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';

import type { Group } from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { UserDTO } from '@oss-idle/shared/user';

import { db } from '../client';

export const users = mysqlTable('user', {
	id: int().primaryKey(), // osu! user ID
	username: varchar({ length: 255 }).notNull(),
	avatarUrl: varchar({ length: 512 }), // osu! avatar; the default profile picture
	country: varchar({ length: 2 }).notNull().default('FR'), // osu! country code, e.g. 'FR'
	currentCharacter: int(),
	// "Recently active" on the friends page; touched while a socket is open
	lastActiveAt: timestamp(),
	// unticked: private messages only from the accounts this one added
	pmFromAnyone: boolean().notNull().default(true),
	// unticked: the character stops playing when the game closes
	keepPlaying: boolean().notNull().default(true),
	// linked from the options; the Discord bot gives this account's level role to it
	discordId: varchar({ length: 32 }).unique(),
	// ticked: a supporter's Discord name keeps its level colour instead of the Supporter pink
	discordLevelColour: boolean().notNull().default(false),
	// the supporter tag shows while this is in the future
	supporterUntil: datetime(),
	// every month of supporter ever received: the profile's hearts
	supporterMonths: int().notNull().default(0),
	// the buyer's Stripe customer, for the subscription portal
	stripeCustomerId: varchar({ length: 255 }).unique(),
	// restricted (osu!'s word): can't play or chat, hidden everywhere, until an admin lifts it
	restrictedAt: timestamp(),
	restrictedReason: varchar({ length: 255 }),
	createdAt: timestamp().notNull().defaultNow(),
	updatedAt: timestamp().notNull().defaultNow().onUpdateNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** Whether the account's oss!supporter tag is running now. */
export const supporterActive = (row: Pick<UserRow, 'supporterUntil'> | undefined) =>
	Boolean(row?.supporterUntil && row.supporterUntil > new Date());

/** Map a user row to the wire contract. `avatarUrl` is the account's osu! avatar;
 *  a per-character custom upload lives on the character and overrides it there. */
export function toUserDTO(row: UserRow, groups: Group[], nominates: RulesetId[]): UserDTO {
	return {
		id: row.id,
		username: row.username,
		avatarUrl: row.avatarUrl,
		country: row.country,
		createdAt: row.createdAt.toISOString(),
		supporter: supporterActive(row),
		restricted: Boolean(row.restrictedAt),
		groups,
		nominates,
	};
}

/** Restricted accounts can't play or chat and are hidden everywhere. So is a deleted one whose
 *  socket is still open. */
export const isRestricted = async (userId: number): Promise<boolean> => {
	const [row] = await db
		.select({ at: users.restrictedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return !row || Boolean(row.at);
};

export const getUserById = async (id: number) => {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	return row;
};
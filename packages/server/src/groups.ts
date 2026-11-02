import {
	and,
	asc,
	eq,
	inArray,
	or,
} from 'drizzle-orm';

import {
	type Group,
	GROUPS,
	OWNER_ID,
} from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { db } from './db/client';
import {
	characters,
	resolveAvatarUrl,
} from './db/schema/character';
import { users } from './db/schema/user';
import {
	userGroups,
	userNominates,
} from './db/schema/user_group';

/** Each account's groups; the owner is always an admin. */
export const groupsByUser = async (userIds: readonly number[]): Promise<Map<number, Group[]>> => {
	const map = new Map<number, Group[]>(userIds.map(id => [id, id === OWNER_ID ? ['admin'] : []]));
	if (!userIds.length) return map;
	const rows = await db.select().from(userGroups).where(inArray(userGroups.userId, [...userIds]));
	for (const { userId, group } of rows) {
		const groups = map.get(userId)!;
		if (!groups.includes(group)) groups.push(group);
	}
	for (const groups of map.values()) groups.sort((a, b) => GROUPS.indexOf(a) - GROUPS.indexOf(b));
	return map;
};

export const groupsOf = async (userId: number | undefined): Promise<Group[]> =>
	userId === undefined ? [] : (await groupsByUser([userId])).get(userId)!;

/** Every member, for the team page: the owner first, then by when they joined. */
export const teamMembers = async () => {
	const rows = await db
		.select({
			userId: users.id,
			username: users.username,
			userAvatarUrl: users.avatarUrl,
			characterId: characters.id,
			name: characters.name,
			avatarUrl: characters.avatarUrl,
			group: userGroups.group,
			since: userGroups.createdAt,
		})
		.from(userGroups)
		.innerJoin(users, eq(users.id, userGroups.userId))
		.leftJoin(characters, eq(characters.id, users.currentCharacter))
		.orderBy(asc(userGroups.createdAt));
	const nominated = await db.select().from(userNominates);
	return rows.map(({ userAvatarUrl, ...row }) => ({
		...row,
		avatarUrl: resolveAvatarUrl(row.avatarUrl, userAvatarUrl),
		nominates: nominated.filter(n => n.userId === row.userId).map(n => n.ruleset),
	}));
};

/** The current characters of every member of any group, the owner included: #team's audience. */
export const teamCharacters = async (): Promise<number[]> => {
	const rows = await db
		.selectDistinct({ id: users.currentCharacter })
		.from(users)
		.leftJoin(userGroups, eq(userGroups.userId, users.id))
		.where(or(eq(users.id, OWNER_ID), eq(userGroups.userId, users.id)));
	return rows.flatMap(r => r.id ?? []);
};

export const addToGroup = async (userId: number, group: Group): Promise<void> => {
	await db.insert(userGroups).values({
		userId, group,
	}).onDuplicateKeyUpdate({ set: { userId } });
};

/** The rulesets a Beatmap Nominator ranks maps in. */
export const nominatesOf = async (userId: number): Promise<RulesetId[]> =>
	(await db.select({ ruleset: userNominates.ruleset })
		.from(userNominates)
		.where(eq(userNominates.userId, userId)))
		.map(row => row.ruleset);

export const setNominates = async (
	userId: number, rulesets: readonly RulesetId[],
): Promise<void> => {
	await db.delete(userNominates).where(eq(userNominates.userId, userId));
	if (rulesets.length) {
		await db.insert(userNominates).values(rulesets.map(ruleset => ({
			userId, ruleset,
		})));
	}
};

export const removeFromGroup = async (userId: number, group: Group): Promise<void> => {
	if (group === 'bn') await setNominates(userId, []);
	await db.delete(userGroups).where(and(eq(userGroups.userId, userId), eq(userGroups.group, group)));
};

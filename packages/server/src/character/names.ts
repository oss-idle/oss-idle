import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import {
	lookalike,
	nameKey,
} from '@oss-idle/shared/lookalike';
import {
	OLD_SUFFIX,
	usesReservedOld,
} from '@oss-idle/shared/rebirth';

import { db } from '../db/client';
import { characters } from '../db/schema/character';
import { farmQuery } from '../db/stats';

/** The name a displaced character falls back to, osu!-style: append _old until
 *  it is free, so a lineage chains Adri -> Adri_old -> Adri_old_old. */
export const displacedName = async (name: string): Promise<string> => {
	let candidate = `${name}${OLD_SUFFIX}`;
	for (;;) {
		const [taken] = await db
			.select({ id: characters.id })
			.from(characters)
			.where(eq(characters.name, candidate))
			.limit(1);
		if (!taken) return candidate;
		candidate = `${candidate}${OLD_SUFFIX}`;
	}
};

/** Reject a name that reads as one already used by another character
 *  (`excludeCharacterId` is the caller's own, for renames), reserved by another
 *  osu! account, or carrying the _old token, which only a player whose own osu!
 *  username has it may use. */
export const assertNameAvailable = async (
	userId: number,
	name: string,
	osuUsername: string,
	excludeCharacterId?: number,
) => {
	const reads = lookalike(name);
	if (usesReservedOld(reads, osuUsername)) {
		throw new HTTPException(403, { message: 'Name is reserved' });
	}

	// ponytail: keys every character name per check; an indexed key column if names grow past ~100k
	const key = nameKey(name);
	const names = await db.select({
		id: characters.id, name: characters.name, 
	}).from(characters);
	if (names.some(c => c.id !== excludeCharacterId && nameKey(c.name) === key)) {
		throw new HTTPException(409, { message: 'Name already taken' });
	}

	// latin1 / utf8mb3 columns: a name outside them (kana, emoji) must not error
	const results1 = await farmQuery(
		'SELECT 1 FROM stats.osu_user WHERE osu_id != ? AND CONVERT(username USING utf8mb4) IN (?, ?) LIMIT 1',
		[userId, name, reads]);
	const results2 = await farmQuery(
		'SELECT 1 FROM farm.user WHERE osu_id != ? AND CONVERT(username USING utf8mb4) IN (?, ?) LIMIT 1',
		[userId, name, reads]);

	if (results1.length || results2.length) {
		throw new HTTPException(403, { message: 'Name is reserved' });
	}
};

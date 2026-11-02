import {
	eq,
	inArray,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { forgetUnlinked } from '../accounts';
import { requireActive } from '../auth/active';
import { db } from '../db/client';
import { characters } from '../db/schema/character';
import { users } from '../db/schema/user';
import { isPbe } from '../env';
import {
	characterIds,
	takeOffline,
} from '../restrictions';
import { recomputeFirstPlace } from '../scores';
import { valid } from '../validate';

const supporterBody = z.object({ on: z.boolean() });

/** Far enough that a tag switched on here never runs out. */
const SUPPORTER_UNTIL = new Date('2100-01-01');

/** Every character of the account and all under them. The account stays, and makes a new one. */
const resetCharacters = async (userId: number): Promise<void> => {
	const ids = await characterIds(userId);
	if (!ids.length) return;
	const held = await takeOffline(ids);
	await forgetUnlinked(userId, ids);
	await db.update(users).set({ currentCharacter: null }).where(eq(users.id, userId));
	await db.delete(characters).where(inArray(characters.id, ids));
	for (const beatmapId of held) await recomputeFirstPlace(beatmapId);
};

/** The PBE's own tools: this code lives on the pbe branch only, and answers nowhere else. */
export const pbeRoutes = new Hono()
	.use(async (_c, next) => {
		if (!isPbe) throw new HTTPException(404, { message: 'Not found' });
		await next();
	})
	.post('/reset', requireActive, async c => {
		await resetCharacters(c.get('userId'));
		return c.json({ ok: true });
	})
	.put('/supporter', requireActive, valid('json', supporterBody), async c => {
		const { on } = c.req.valid('json');
		await db.update(users).set({
			supporterUntil: on ? SUPPORTER_UNTIL : null, supporterMonths: on ? 1 : 0,
		}).where(eq(users.id, c.get('userId')));
		return c.json({ ok: true });
	});

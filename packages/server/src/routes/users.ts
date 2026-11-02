import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { isModerator } from '@oss-idle/shared/groups';

import { sessionUserId } from '../auth/middleware';
import { db } from '../db/client';
import {
	toUserDTO,
	users,
} from '../db/schema/user';
import {
	groupsOf,
	nominatesOf,
} from '../groups';
import {
	standing,
	visibleTo,
} from '../restrictions';
import { idParam } from '../validate';


/**
 * Example feature route. Demonstrates the full path a request travels -
 * param validation (zod) → DB query (Drizzle) → shared DTO response - and the
 * convention future routes should follow.
 *
 * Defined as a single chained expression so Hono captures each route in the
 * exported type; that type flows to the client's typed RPC client.
 */
export const usersRoutes = new Hono()
	.get('/:id', async c => {
		const id = idParam.parse(c.req.param('id'));

		const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);

		const viewer = await sessionUserId(c);
		if (!row || !await visibleTo(row, viewer)) {
			throw new HTTPException(404, { message: 'User not found' });
		}

		return c.json(toUserDTO(row, await groupsOf(row.id), await nominatesOf(row.id)));
	})

	// osu-web's Account Standing: for the player and the moderators.
	.get('/:id/standing', async c => {
		const id = idParam.parse(c.req.param('id'));
		const viewer = await sessionUserId(c);
		const moderator = isModerator(await groupsOf(viewer));
		if (viewer !== id && !moderator) throw new HTTPException(404, { message: 'User not found' });
		return c.json(await standing(id, moderator));
	});

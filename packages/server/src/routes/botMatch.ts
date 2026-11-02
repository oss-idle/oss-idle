import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { requireAuth } from '../auth/middleware';
import { renderBotMatchCard } from '../botMatchCard';
import {
	ownBotMatch,
	publicBotMatch,
	requestBotMatch,
} from '../botMatchQueue';
import {
	idParam,
	valid,
} from '../validate';

const userParam = z.object({ id: idParam });

const shared = async (id: number) => {
	const match = await publicBotMatch(id);
	if (!match) throw new HTTPException(404, { message: 'No match' });
	return match;
};

/** Which levels play closest to a player's real top plays (botMatch.ts). */
export const botMatchRoutes = new Hono()
	.get('/me', requireAuth, async c => c.json(await ownBotMatch(c.get('userId'))))
	.post('/me', requireAuth, async c => {
		await requestBotMatch(c.get('userId'));
		return c.json(await ownBotMatch(c.get('userId')));
	})
	.get('/:id', valid('param', userParam), async c => c.json(await shared(c.req.valid('param').id)))
	// The image a shared link unfurls into (nginx points og:image here).
	.get('/:id/card.png', valid('param', userParam), async c => {
		const { result, ranks } = await shared(c.req.valid('param').id);
		const png = await renderBotMatchCard(result, ranks);
		c.header('Content-Type', 'image/png');
		c.header('Cache-Control', 'public, max-age=3600');
		return c.body(new Uint8Array(png));
	});

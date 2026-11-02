import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { checkoutBody } from '@oss-idle/shared/supporter';

import { requireAdmin } from '../auth/admin';
import { claimStateNonce } from '../auth/handoff';
import {
	signLinkState,
	verifyLinkState,
} from '../auth/jwt';
import { requireAuth } from '../auth/middleware';
import { warn } from '../discord/error';
import {
	clientUrl,
	env,
	isPbe,
} from '../env';
import {
	claimItch,
	fetchItchUserId,
	itchAuthorizeUrl,
} from '../itch';
import {
	adminOrders,
	checkout,
	findRecipient,
	handleWebhook,
	ordersOf,
	portal,
	refundUnused,
	supporterStatus,
} from '../supporter';
import {
	idParam,
	valid,
} from '../validate';

const recipientQuery = z.object({ name: z.string().trim().min(1) });

const settingsUrl = `${clientUrl}/web/settings`;

export const storeRoutes = new Hono()
	// no store on the PBE: the tag is a setting there (pbe/routes.ts)
	.use(async (_c, next) => {
		if (isPbe) throw new HTTPException(404, { message: 'Not found' });
		await next();
	})

	.get('/me', requireAuth, async c => c.json(await supporterStatus(c.get('userId'))))

	.get('/orders', requireAuth, async c => c.json(await ordersOf(c.get('userId'))))

	.get('/recipient', requireAuth, valid('query', recipientQuery), async c => {
		const recipient = await findRecipient(c.req.valid('query').name);
		if (!recipient) throw new HTTPException(404, { message: 'Player not found' });
		return c.json(recipient);
	})

	.post('/checkout', requireAuth, valid('json', checkoutBody), async c => {
		const url = await checkout(c.get('userId'), c.req.valid('json'));
		return c.json({ url });
	})

	.post('/portal', requireAuth, async c => c.json({ url: await portal(c.get('userId')) }))

	// itch.io: where to sign in to claim this account's donations as supporter
	.get('/itch', requireAuth, async c => {
		if (!env.ITCH_API_KEY) throw new HTTPException(503, { message: 'itch.io claims are not configured' });
		return c.json({ url: itchAuthorizeUrl(await signLinkState(c.get('userId'), 'itch')) });
	})

	// back from itch.io: the settings page says what the claim gave
	.get('/itch/callback', async c => {
		const code = c.req.query('code');
		const state = c.req.query('state');
		if (!code || !state) return c.redirect(settingsUrl);

		let uid: number;
		let nonce: string;
		try {
			({ uid, nonce } = await verifyLinkState(state, 'itch'));
		} catch {
			throw new HTTPException(400, { message: 'Invalid or expired state' });
		}
		if (!await claimStateNonce(nonce)) return c.redirect(settingsUrl);

		try {
			const seconds = await claimItch(uid, await fetchItchUserId(code, state));
			return c.redirect(`${settingsUrl}?itch=${seconds}`);
		} catch (e) {
			warn(`itch.io claim failed: ${(e as Error).message}`);
			return c.redirect(`${settingsUrl}?itch=error`);
		}
	})

	.get('/admin/orders', requireAdmin, async c => c.json(await adminOrders()))

	// refunds the part of the tag not used yet; the webhook cuts the tag when Stripe confirms
	.post('/admin/orders/:id/refund', requireAdmin, async c =>
		c.json({ refunded: await refundUnused(idParam.parse(c.req.param('id'))) }))

	// Stripe calls this; the signature is the auth
	.post('/webhook', async c => {
		await handleWebhook(await c.req.text(), c.req.header('stripe-signature'));
		return c.json({ received: true });
	});

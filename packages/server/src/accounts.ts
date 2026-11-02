import { unlink } from 'node:fs/promises';

import {
	eq,
	inArray,
} from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db } from './db/client';
import { addons } from './db/schema/addon';
import { characters } from './db/schema/character';
import { matchEvents } from './db/schema/match';
import { skins } from './db/schema/skin';
import { users } from './db/schema/user';
import {
	env,
	isProd,
} from './env';
import {
	characterIds,
	takeOffline,
} from './restrictions';
import { enabledRulesets } from './rulesets/registry';
import { recomputeFirstPlace } from './scores';
import { needStripe } from './stripe';
import {
	UPLOAD_DIR,
	UPLOAD_ROUTE,
} from './uploads';
import { forgetChatUser } from './ws/chat';

/** The files this account uploaded: avatars, banners, skin and addon icons. */
const uploadsOf = async (userId: number, characterIds: number[]): Promise<string[]> => {
	const rows = await Promise.all([
		db.select({
			a: characters.avatarUrl, b: characters.bannerUrl,
		}).from(characters).where(inArray(characters.id, characterIds)),
		db.select({ a: skins.icon }).from(skins).where(eq(skins.authorId, userId)),
		db.select({ a: addons.icon }).from(addons).where(eq(addons.authorId, userId)),
	]);
	return rows.flat()
		.flatMap(r => Object.values(r))
		.filter((url): url is string => typeof url === 'string' && url.startsWith(`${UPLOAD_ROUTE}/`))
		.map(url => `${UPLOAD_DIR}/${url.slice(UPLOAD_ROUTE.length + 1)}`);
};

/** Deleting the customer cancels its subscription. One Stripe doesn't know (a staging copy of
 *  prod's ids, or already gone) is nothing to delete. */
const deleteCustomer = async (customer: string): Promise<void> => {
	try {
		await needStripe().customers.del(customer);
	} catch (e) {
		if ((e as { code?: string }).code !== 'resource_missing') throw e;
	}
};

/** The rows that point at the account without a foreign key, so the delete can't reach them. */
export const forgetUnlinked = async (userId: number, characterIds: number[]): Promise<void> => {
	for (const { requestVotes } of enabledRulesets()) {
		await db.delete(requestVotes).where(eq(requestVotes.userId, userId));
	}
	// the map proposal stays for the others who backed it, without its proposer
	for (const { requests } of enabledRulesets()) {
		await db.update(requests).set({ userId: 0 }).where(eq(requests.userId, userId));
	}
	if (!characterIds.length) return;
	for (const { matchScores } of enabledRulesets()) {
		await db.delete(matchScores).where(inArray(matchScores.characterId, characterIds));
	}
	await db.delete(matchEvents).where(inArray(matchEvents.characterId, characterIds));
};

/** Deletes an account for good (a GDPR request): its characters and everything under them,
 *  its uploads and its Stripe customer (which cancels a subscription). Payment records stay,
 *  without the account, as the law requires. Backups keep a copy for up to 6 months. */
export const deleteAccount = async (userId: number): Promise<void> => {
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) throw new HTTPException(404, { message: 'User not found' });
	const ids = await characterIds(userId);
	const held = await takeOffline(ids);
	const files = await uploadsOf(userId, ids);
	if (user.stripeCustomerId && env.STRIPE_SECRET_KEY) await deleteCustomer(user.stripeCustomerId);

	await forgetUnlinked(userId, ids);
	await forgetChatUser(userId, ids);
	await db.delete(users).where(eq(users.id, userId));

	for (const beatmapId of held) await recomputeFirstPlace(beatmapId);
	// staging shares prod's uploads folder: there, these are prod's files
	if (isProd) for (const file of files) await unlink(file).catch(() => undefined);
};

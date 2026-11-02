import {
	and,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type Stripe from 'stripe';

import { isModerator } from '@oss-idle/shared/groups';
import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';
import type {
	Sanction,
	Standing,
} from '@oss-idle/shared/standing';

import { db } from './db/client';
import { accountHistory } from './db/schema/account_history';
import { characters } from './db/schema/character';
import { supporterOrders } from './db/schema/supporter_order';
import { users } from './db/schema/user';
import { groupsOf } from './groups';
import {
	abortPlay,
	playState,
} from './play';
import { logOff } from './queue';
import {
	reindexCharacterEverywhere,
	unindexCharacter,
} from './rankings';
import { enabledRulesets } from './rulesets/registry';
import { recomputeFirstPlace } from './scores';
import { slotOf } from './slot';
import {
	cancelSubscriptions,
	idOf,
} from './stripe';
import {
	moderationOf,
	setBanned,
	timeoutUser,
	untimeoutUser,
} from './ws/chat';
import { leave } from './ws/presence';

/** A restricted account exists only for itself and the moderators. */
export const visibleTo = async (
	owner: { id: number; restrictedAt: Date | null }, viewer: number | undefined,
): Promise<boolean> =>
	!owner.restrictedAt || viewer === owner.id || isModerator(await groupsOf(viewer));

const log = (userId: number, action: Sanction, reason: string, seconds: number, actorId: number) =>
	db.insert(accountHistory).values({
		userId, action, reason: reason.slice(0, 255), seconds, actorId,
	});

/** osu!'s silence: no chat or private messages for `seconds`, or until lifted with 0. */
export const silence = async (
	userId: number, seconds: number, reason: string, actorId: number,
): Promise<void> => {
	if (seconds) await timeoutUser(userId, seconds);
	else await setBanned(userId, true);
	await log(userId, 'silence', reason, seconds, actorId);
};

export const unsilence = async (userId: number): Promise<void> => {
	await untimeoutUser(userId);
	await setBanned(userId, false);
};

export const characterIds = async (userId: number) => (await db
	.select({ id: characters.id })
	.from(characters)
	.where(eq(characters.userId, userId))).map(c => c.id);

/** Stops what the characters have running and takes them off every board. Returns the maps
 *  they held #1 on, for the caller to recompute. */
export const takeOffline = async (ids: number[]): Promise<number[]> => {
	for (const id of ids) {
		for (const ruleset of RULESET_IDS) {
			const slot = slotOf(id, ruleset);
			await logOff(slot);
			const state = await playState(slot);
			if (state.phase === 'active') await abortPlay(slot, state.token);
			await leave(slot);
		}
		await unindexCharacter(id);
	}
	if (!ids.length) return [];
	return (await Promise.all(enabledRulesets().map(async ({ firstPlace }) => (await db
		.select({ beatmapId: firstPlace.beatmapId })
		.from(firstPlace)
		.where(inArray(firstPlace.characterId, ids))).map(r => r.beatmapId)))).flat();
};

/** osu!'s restricted mode: the account can't play or chat, and drops off every ranking,
 *  leaderboard, #1 and the online list until a moderator lifts it. `actorId` 0 is the server. */
export const restrict = async (userId: number, reason: string, actorId = 0): Promise<void> => {
	const [{ affectedRows }] = await db.update(users)
		.set({
			restrictedAt: new Date(), restrictedReason: reason.slice(0, 255),
		})
		.where(and(eq(users.id, userId), isNull(users.restrictedAt)));
	if (!affectedRows) return;
	await log(userId, 'restriction', reason, 0, actorId);

	const held = await takeOffline(await characterIds(userId));
	for (const beatmapId of held) await recomputeFirstPlace(beatmapId);
};

/** Puts the account back everywhere, its #1s included. */
export const unrestrict = async (userId: number): Promise<void> => {
	const [{ affectedRows }] = await db.update(users)
		.set({
			restrictedAt: null, restrictedReason: null,
		})
		.where(and(eq(users.id, userId), isNotNull(users.restrictedAt)));
	if (!affectedRows) return;

	const ids = await characterIds(userId);
	for (const id of ids) await reindexCharacterEverywhere(id);
	if (!ids.length) return;
	for (const { best } of enabledRulesets()) {
		const maps = await db
			.selectDistinct({ beatmapId: best.beatmapId })
			.from(best)
			.where(inArray(best.characterId, ids));
		for (const { beatmapId } of maps) await recomputeFirstPlace(beatmapId);
	}
};

const actor = alias(users, 'actor');
const actorCharacter = alias(characters, 'actor_character');

/** osu-web's Account Standing: the sanctions in force and every past one, newest first. The
 *  moderators' names are for the team only. */
export const standing = async (userId: number, withActors: boolean): Promise<Standing> => {
	const [user] = await db
		.select({ restrictedAt: users.restrictedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const chat = await moderationOf(userId);
	const rows = await db
		.select({
			id: accountHistory.id,
			action: accountHistory.action,
			reason: accountHistory.reason,
			seconds: accountHistory.seconds,
			at: accountHistory.createdAt,
			actor: actorCharacter.name,
		})
		.from(accountHistory)
		.leftJoin(actor, eq(actor.id, accountHistory.actorId))
		.leftJoin(actorCharacter, eq(actorCharacter.id, actor.currentCharacter))
		.where(eq(accountHistory.userId, userId))
		.orderBy(desc(accountHistory.createdAt), desc(accountHistory.id));
	return {
		silencedUntil: chat.timeoutUntil,
		silenced: chat.banned,
		restricted: Boolean(user?.restrictedAt),
		history: rows.map(({ at, actor, ...row }) => ({
			...row,
			at: at.getTime(),
			...withActors && actor ? { actor } : {},
		})),
	};
};

/** The restricted accounts, newest first, for the admin page. */
export const restrictedAccounts = () => db
	.select({
		userId: users.id,
		username: users.username,
		characterId: characters.id,
		name: characters.name,
		at: users.restrictedAt,
		reason: users.restrictedReason,
	})
	.from(users)
	.leftJoin(characters, eq(characters.id, users.currentCharacter))
	.where(isNotNull(users.restrictedAt))
	.orderBy(desc(users.restrictedAt));

/** A chargeback restricts the buyer, like osu! does, and stops their renewals. Lifting it is an
 *  admin's call. */
export const onDispute = async (dispute: Stripe.Dispute): Promise<void> => {
	const paymentIntent = idOf(dispute.payment_intent);
	if (!paymentIntent) return;
	const [order] = await db
		.select({
			id: supporterOrders.id, buyerId: supporterOrders.buyerId,
		})
		.from(supporterOrders)
		.where(eq(supporterOrders.paymentIntent, paymentIntent))
		.limit(1);
	// the payment's own event may still be on its way: fail, so Stripe delivers this again later
	if (!order) throw new Error(`dispute ${dispute.id}: no order for ${paymentIntent} yet`);
	// the buyer may have deleted their account since
	if (order.buyerId === null) return;
	await restrict(order.buyerId, `chargeback on order ${order.id}`);
	const [buyer] = await db
		.select({ customer: users.stripeCustomerId })
		.from(users)
		.where(eq(users.id, order.buyerId))
		.limit(1);
	if (buyer?.customer) await cancelSubscriptions(buyer.customer);
};

import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gt,
	isNull,
	lte,
	ne,
	or,
	type SQL,
	sql,
	sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { HTTPException } from 'hono/http-exception';
import { createTransport } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import type Stripe from 'stripe';

import { CONTACT_EMAIL } from '@oss-idle/shared/contact';
import {
	type CheckoutBody,
	supporterMonths,
	supportLevel,
	unusedRefund,
} from '@oss-idle/shared/supporter';

import { received } from './abby';
import { db } from './db/client';
import {
	characters,
	resolveAvatarUrl,
} from './db/schema/character';
import { supporterOrders } from './db/schema/supporter_order';
import { users } from './db/schema/user';
import { warn } from './discord/error';
import {
	clientUrl,
	env,
	redisKeyPrefix,
} from './env';
import { supporterEvent } from './events';
import { fileSent } from './mailSent';
import { redis } from './redis';
import { onDispute } from './restrictions';
import {
	idOf,
	needStripe,
} from './stripe';
import { onRefund } from './supporterRefund';
import { supporterThanks } from './supporterThanks';

const storeUrl = `${clientUrl}/web/store`;

/** What a checkout carries to the webhook: on the session, and on the subscription for its renewals. */
type OrderMeta = {
	buyerId: string;
	recipientId: string;
	months: string;
};

export const isSupporter = async (userId: number): Promise<boolean> => {
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, userId), gt(users.supporterUntil, sql`NOW()`)))
		.limit(1);
	return Boolean(row);
};

type Payment = {
	amount: number;
	recurring: boolean;
	// the checkout session (one-off) or the invoice (subscription)
	stripeRef: string;
	paymentIntent: string | undefined;
};

export const tagStart = sql`GREATEST(COALESCE(${users.supporterUntil}, NOW()), NOW())`;
const asDate = (date: SQL) => sql<Date>`${date}`.mapWith(users.supporterUntil);

/** A payment for an account deleted since (a renewing gift, a late bank transfer) goes back,
 *  and its renewals stop. */
const giveBack = async (payment: Payment, subscription: string | undefined): Promise<void> => {
	const s = needStripe();
	if (subscription) {
		await s.subscriptions.cancel(subscription).catch((e: { code?: string }) => {
			if (e.code !== 'resource_missing') throw e;
		});
	}
	if (payment.paymentIntent) {
		await s.refunds.create(
			{ payment_intent: payment.paymentIntent },
			{ idempotencyKey: `gone-${payment.stripeRef}` },
		);
	}
};

const mailer = env.SMTP_URL ? createTransport(env.SMTP_URL) : undefined;

/** The recipient's tag just before this order landed. */
type Before = {
	months: number;
	active: boolean;
};

/** How many seconds a donation pays the server for */
export const serverSeconds = (cents: number): number | undefined => env.SERVER_MONTHLY_COST
	&& Math.floor(env.SUPPORTER_TAXES.reduce((net, tax) => net * (1 - tax / 100), cents / 100)
		/ env.SERVER_MONTHLY_COST * 365.25 / 12 * 86400);

const THANKS_KEY = `${redisKeyPrefix}supporter:thanks`;
// Stripe attaches the balance transaction seconds to minutes after the checkout
const NET_WAIT_MS = 10 * 60_000;

type PendingThanks = {
	to: string;
	before: Before;
	at: number;
};

/** Sends one thank-you; false while the payment's net amount is still on its way. */
const sendThanks = async (orderId: number, { to, before, at }: PendingThanks): Promise<boolean> => {
	if (!mailer || !env.SMTP_URL) return true;
	const [order] = await orderRows(eq(supporterOrders.id, orderId));
	if (!order?.buyerId) return true;
	const net = await received(order).catch(() => undefined);
	if (net === undefined && Date.now() - at < NET_WAIT_MS) return false;
	const [bought] = await db
		.select({ n: count() })
		.from(supporterOrders)
		.where(and(eq(supporterOrders.buyerId, order.buyerId), lte(supporterOrders.id, orderId)));
	const {
		subject, text, html,
	} = supporterThanks({
		firstPurchase: bought?.n === 1,
		firstTag: before.months === 0,
		heartsBefore: supportLevel(before.active, before.months),
		heartsAfter: supportLevel(true, before.months + order.months),
		buyerName: order.buyerName ?? undefined,
		giftTo: order.recipientId === order.buyerId ? undefined : order.recipientName ?? 'another player',
		months: order.months,
		serverSeconds: serverSeconds(net ?? 0),
		recurring: order.recurring,
		tagEndsAt: order.endsAt ?? undefined,
		storeUrl,
	});
	const raw = await new MailComposer({
		from: {
			name: 'oss!idle', address: CONTACT_EMAIL,
		}, to, subject, text, html,
	}).compile().build();
	await mailer.sendMail({
		envelope: {
			from: CONTACT_EMAIL, to,
		}, raw,
	});
	await fileSent(env.SMTP_URL, raw).catch((e: Error) => {
		warn(`Supporter order ${orderId}: thank-you sent, but not filed in Sent: ${e.message}`);
	});
	return true;
};

/** Sends the thank-yous grant queued, kept in Redis so a reload doesn't lose them. */
export const sweepThanks = async (): Promise<void> => {
	if (!mailer) return;
	const lock = `${THANKS_KEY}:lock`;
	if (await redis.set(lock, '1', 'EX', 600, 'NX') !== 'OK') return;
	try {
		for (const [id, raw] of Object.entries(await redis.hgetall(THANKS_KEY))) {
			const sent = await sendThanks(Number(id), JSON.parse(raw) as PendingThanks).catch((e: Error) => {
				warn(`Supporter order ${id}: thank-you email not sent: ${e.message}`);
				return true;
			});
			if (sent) await redis.hdel(THANKS_KEY, id);
		}
	} finally {
		await redis.del(lock);
	}
};

/** A paid tag lands: extends the recipient's tag from now or from its current end, once per
 *  payment (Stripe retries a webhook until it is acknowledged), and thanks the buyer by email. */
const grant = async (
	meta: OrderMeta,
	payment: Payment,
	email: string | undefined,
	subscription?: string,
): Promise<void> => {
	const buyerId = Number(meta.buyerId);
	const recipientId = Number(meta.recipientId);
	const months = Number(meta.months);
	if (!buyerId || !recipientId || !months) {
		throw new Error(`supporter order ${payment.stripeRef} has no metadata`);
	}

	const landed = await db.transaction(async tx => {
		const [window] = await tx
			.select({
				startsAt: asDate(tagStart),
				endsAt: asDate(sql`DATE_ADD(${tagStart}, INTERVAL ${months} MONTH)`),
				until: users.supporterUntil,
				monthsBefore: users.supporterMonths,
			})
			.from(users)
			.where(eq(users.id, recipientId))
			.for('update');
		if (!window) return undefined;
		const {
			startsAt, endsAt, until, monthsBefore,
		} = window;
		const [{ affectedRows, insertId }] = await tx.insert(supporterOrders).ignore().values({
			...payment, buyerId, recipientId, months, startsAt, endsAt,
		});
		if (!affectedRows) return {};
		await tx.update(users).set({
			supporterUntil: endsAt,
			supporterMonths: sql`${users.supporterMonths} + ${months}`,
		}).where(eq(users.id, recipientId));
		const before = {
			months: monthsBefore, active: Boolean(until && until > new Date()),
		};
		return {
			order: {
				id: insertId, before,
			},
		};
	});
	if (!landed) {
		await giveBack(payment, subscription);
		return;
	}
	const { order } = landed;
	if (order) await supporterEvent(recipientId, buyerId !== recipientId);
	if (order && email && mailer) {
		const thanks: PendingThanks = {
			to: email, before: order.before, at: Date.now(),
		};
		await redis.hset(THANKS_KEY, order.id, JSON.stringify(thanks)).catch((e: Error) => {
			warn(`Supporter order ${order.id}: thank-you email not queued: ${e.message}`);
		});
	}
};

const WAIVER_TEXT = 'The supporter tag starts right away: you gave up the 14-day withdrawal right.';

const account = async (userId: number) => {
	const [row] = await db
		.select({
			until: users.supporterUntil,
			months: users.supporterMonths,
			customer: users.stripeCustomerId,
			restricted: users.restrictedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row;
};

/** The buyer, once both ends of the order may take part in it. */
const parties = async (buyerId: number, recipientId: number) => {
	const buyer = await account(buyerId);
	// a restricted account can't buy, so a stolen card can't charge back over and over
	if (buyer?.restricted) throw new HTTPException(403, { message: 'Your account is restricted' });
	const recipient = await account(recipientId);
	if (!recipient || recipient.restricted) throw new HTTPException(404, { message: 'Player not found' });
	return buyer;
};

/** A Stripe Checkout page for one tag, or a subscription renewing the same amount every
 *  same number of months. */
export const checkout = async (buyerId: number, body: CheckoutBody): Promise<string> => {
	const s = needStripe();
	const recipientId = body.recipientId ?? buyerId;
	const buyer = await parties(buyerId, recipientId);

	const months = supporterMonths(body.amount);
	const metadata: OrderMeta = {
		buyerId: String(buyerId), recipientId: String(recipientId), months: String(months),
	};
	const session = await s.checkout.sessions.create({
		mode: body.recurring ? 'subscription' : 'payment',
		line_items: [{
			quantity: 1,
			price_data: {
				currency: 'eur',
				unit_amount: body.amount * 100,
				product_data: { name: `oss!idle supporter tag, ${months} month${months > 1 ? 's' : ''}` },
				recurring: body.recurring ? {
					interval: 'month', interval_count: months,
				} : undefined,
			},
		}],
		customer: buyer?.customer ?? undefined,
		customer_creation: !body.recurring && !buyer?.customer ? 'always' : undefined,
		client_reference_id: String(buyerId),
		metadata: {
			...metadata, waiver: new Date().toISOString(),
		},
		subscription_data: body.recurring ? { metadata } : undefined,
		custom_text: { submit: { message: WAIVER_TEXT } },
		success_url: `${storeUrl}?paid=1`,
		cancel_url: storeUrl,
	});
	if (!session.url) throw new Error('Stripe gave no checkout url');
	return session.url;
};

/** Stripe's page to cancel a subscription or change its card. */
export const portal = async (userId: number): Promise<string> => {
	const s = needStripe();
	const customer = (await account(userId))?.customer;
	if (!customer) throw new HTTPException(404, { message: 'No purchase yet' });
	const session = await s.billingPortal.sessions.create({
		customer, return_url: storeUrl,
	});
	return session.url;
};

const rememberCustomer = async (buyerId: number, customer: string | undefined): Promise<void> => {
	if (!customer) return;
	await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, buyerId));
};

const onCheckout = async (session: Stripe.Checkout.Session): Promise<void> => {
	await rememberCustomer(Number(session.client_reference_id), idOf(session.customer));
	if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
	await grant(session.metadata as OrderMeta, {
		amount: session.amount_total ?? 0,
		recurring: false,
		stripeRef: session.id,
		paymentIntent: idOf(session.payment_intent),
	}, session.customer_details?.email ?? undefined);
};

const onInvoice = async (invoice: Stripe.Invoice): Promise<void> => {
	const meta = invoice.parent?.subscription_details?.metadata;
	if (!meta || !invoice.id) return;
	const payments = await needStripe().invoicePayments.list({
		invoice: invoice.id, limit: 1,
	});
	await grant(meta as OrderMeta, {
		amount: invoice.amount_paid,
		recurring: true,
		stripeRef: invoice.id,
		paymentIntent: idOf(payments.data[0]?.payment.payment_intent),
	}, invoice.customer_email ?? undefined, idOf(invoice.parent?.subscription_details?.subscription));
};

const CHECKOUT_EVENTS = new Set([
	'checkout.session.completed',
	'checkout.session.async_payment_succeeded',
]);

/** Verifies and applies one webhook delivery. One-off tags land on their checkout, subscription
 *  ones on each paid invoice (the first one included). */
export const handleWebhook = async (
	payload: string,
	signature: string | undefined,
): Promise<void> => {
	const s = needStripe();
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret || !signature) throw new HTTPException(400, { message: 'Unsigned' });
	let event: Stripe.Event;
	try {
		event = s.webhooks.constructEvent(payload, signature, secret);
	} catch {
		throw new HTTPException(400, { message: 'Bad signature' });
	}

	if (CHECKOUT_EVENTS.has(event.type)) await onCheckout(event.data.object as Stripe.Checkout.Session);
	else if (event.type === 'invoice.paid') await onInvoice(event.data.object);
	else if (event.type === 'charge.refunded') await onRefund(event.data.object);
	else if (event.type === 'charge.dispute.created') await onDispute(event.data.object);
};

/** The store page's header: the tag, and what this account gave. */
const giftsBy = async (userId: number) => {
	const [gifts] = await db
		.select({
			total: sum(supporterOrders.amount),
			months: sum(supporterOrders.months),
			players: countDistinct(supporterOrders.recipientId),
		})
		.from(supporterOrders)
		.where(and(eq(supporterOrders.buyerId, userId), ne(supporterOrders.recipientId, userId)));
	return {
		gifted: Number(gifts?.total ?? 0),
		giftedMonths: Number(gifts?.months ?? 0),
		giftedPlayers: gifts?.players ?? 0,
	};
};

export const supporterStatus = async (userId: number) => {
	const user = await account(userId);
	const [given] = await db
		.select({ total: sum(supporterOrders.amount) })
		.from(supporterOrders)
		.where(eq(supporterOrders.buyerId, userId));
	const until = user?.until && user.until > new Date() ? user.until.getTime() : undefined;
	return {
		until,
		months: user?.months ?? 0,
		contributed: Number(given?.total ?? 0),
		...await giftsBy(userId),
		customer: Boolean(user?.customer),
	};
};

const buyerCharacter = alias(characters, 'buyer_character');
const recipientCharacter = alias(characters, 'recipient_character');
const buyerUser = alias(users, 'buyer_user');
const recipientUser = alias(users, 'recipient_user');

/** Orders with who bought them and who they were for, newest first. */
export const orderRows = (where?: SQL) => db
	.select({
		id: supporterOrders.id,
		amount: supporterOrders.amount,
		refunded: supporterOrders.refunded,
		months: supporterOrders.months,
		recurring: supporterOrders.recurring,
		at: supporterOrders.createdAt,
		startsAt: supporterOrders.startsAt,
		endsAt: supporterOrders.endsAt,
		paymentIntent: supporterOrders.paymentIntent,
		buyerId: supporterOrders.buyerId,
		recipientId: supporterOrders.recipientId,
		buyerName: buyerCharacter.name,
		recipientName: recipientCharacter.name,
		recipientCharacterId: recipientCharacter.id,
	})
	.from(supporterOrders)
	.leftJoin(buyerUser, eq(buyerUser.id, supporterOrders.buyerId))
	.leftJoin(recipientUser, eq(recipientUser.id, supporterOrders.recipientId))
	.leftJoin(buyerCharacter, eq(buyerCharacter.id, buyerUser.currentCharacter))
	.leftJoin(recipientCharacter, eq(recipientCharacter.id, recipientUser.currentCharacter))
	.where(where)
	.orderBy(desc(supporterOrders.id))
	.limit(200);

/** Order history: what this account bought, and the tags it was given. */
export const ordersOf = async (userId: number) => {
	const mine = or(eq(supporterOrders.buyerId, userId), eq(supporterOrders.recipientId, userId));
	return (await orderRows(mine)).map(r => ({
		id: r.id,
		amount: r.amount,
		refunded: r.refunded,
		months: r.months,
		recurring: r.recurring,
		buyerId: r.buyerId ?? undefined,
		recipientId: r.recipientId ?? undefined,
		at: r.at.getTime(),
		buyerName: r.buyerName ?? undefined,
		recipientName: r.recipientName ?? undefined,
		recipientCharacterId: r.recipientCharacterId ?? undefined,
	}));
};

/** Who a gift goes to, by their current character's name. */
export const findRecipient = async (name: string) => {
	const [row] = await db
		.select({
			userId: users.id,
			characterId: characters.id,
			name: characters.name,
			avatarUrl: characters.avatarUrl,
			osuAvatarUrl: users.avatarUrl,
		})
		.from(characters)
		.innerJoin(users, eq(users.currentCharacter, characters.id))
		.where(and(eq(characters.name, name), isNull(users.restrictedAt)))
		.limit(1);
	return row && {
		userId: row.userId,
		characterId: row.characterId,
		name: row.name,
		avatarUrl: resolveAvatarUrl(row.avatarUrl, row.osuAvatarUrl),
	};
};

/** Every order, with what refunding its unused part would give back. */
export const adminOrders = async () => (await orderRows()).map(({ paymentIntent, ...r }) => ({
	...r,
	buyerId: r.buyerId ?? undefined,
	recipientId: r.recipientId ?? undefined,
	at: r.at.getTime(),
	startsAt: r.startsAt?.getTime(),
	endsAt: r.endsAt?.getTime(),
	buyerName: r.buyerName ?? undefined,
	recipientName: r.recipientName ?? undefined,
	recipientCharacterId: r.recipientCharacterId ?? undefined,
	unused: unusedRefund({
		...r, paymentIntent,
	}),
}));

/** Refunds the part of an order's tag not used yet. The tag itself is cut when Stripe confirms. */
export const refundUnused = async (orderId: number): Promise<number> => {
	const [order] = await db
		.select()
		.from(supporterOrders)
		.where(eq(supporterOrders.id, orderId))
		.limit(1);
	if (!order) throw new HTTPException(404, { message: 'Order not found' });
	const amount = unusedRefund(order);
	if (!order.paymentIntent || amount <= 0) throw new HTTPException(400, { message: 'Nothing left to refund' });
	await needStripe().refunds.create({
		payment_intent: order.paymentIntent,
		amount,
		metadata: { orderId: String(order.id) },
	}, { idempotencyKey: `unused-${order.id}-${order.refunded}` });
	return amount;
};

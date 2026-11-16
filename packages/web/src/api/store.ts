import type { CheckoutBody } from '@oss-idle/shared/supporter';

import {
	rpc,
	unwrap,
} from './client';

/** The signed-in account's supporter tag and what it gave. */
export const getSupporterStatus = () =>
	unwrap(rpc.v1.store.me.$get());

export const getOrders = () =>
	unwrap(rpc.v1.store.orders.$get());

/** A gift's recipient, by their character's name. */
export const findRecipient = (name: string) =>
	unwrap(rpc.v1.store.recipient.$get({ query: { name } }));

/** Where Stripe's checkout page for this tag lives. */
export const startCheckout = (body: CheckoutBody) =>
	unwrap(rpc.v1.store.checkout.$post({ json: body }));

/** itch.io's sign-in page for claiming this account's donations. */
export const getItchClaimUrl = () =>
	unwrap(rpc.v1.store.itch.$get());

/** Stripe's page to manage a subscription. */
export const openPortal = () =>
	unwrap(rpc.v1.store.portal.$post());

/** Admin: every order, with what refunding its unused part would give back. */
export const listAllOrders = () =>
	unwrap(rpc.v1.store.admin.orders.$get());

export type AdminOrder = Awaited<ReturnType<typeof listAllOrders>>[number];

/** Admin: add months of supporter to an account, with no order. */
export const giveSupporter = (userId: number, months: number) =>
	unwrap(rpc.v1.store.admin.give[':userId'].$post({
		param: { userId: String(userId) }, json: { months },
	}));

/** Admin: refund the part of an order's tag not used yet. */
export const refundUnused = (id: number) =>
	unwrap(rpc.v1.store.admin.orders[':id'].refund.$post({ param: { id: String(id) } }));

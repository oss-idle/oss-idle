import { z } from 'zod';

/** The slider's range, in whole euros: 1 month to 2 years. */
export const MIN_SUPPORT = 4;
export const MAX_SUPPORT = 52;

/** The month presets under the slider. */
export const SUPPORT_PRESETS = [1, 2, 4, 6, 12, 18, 24] as const;

/** Euros → months of supporter, osu!'s table (`SupporterTag::getDuration`). */
export const supporterMonths = (euros: number): number => {
	if (euros >= 26) return Math.floor(euros / 26 * 12);
	if (euros >= 24) return 10;
	if (euros >= 22) return 9;
	if (euros >= 20) return 8;
	if (euros >= 16) return 6;
	if (euros >= 12) return 4;
	if (euros >= 8) return 2;
	if (euros >= 4) return 1;
	return 0;
};

/** The cheapest amount that buys `months` (a preset's slider position). */
export const supporterPrice = (months: number): number => {
	if (months >= 12) return Math.ceil(months / 12 * 26);
	const steps: Record<number, number> = {
		10: 24, 9: 22, 8: 20, 6: 16, 4: 12, 2: 8, 1: 4,
	};
	return steps[months] ?? MIN_SUPPORT;
};

const MONTH_SECONDS = 365.25 / 12 * 86400;

/** supporterMonths' steps as [euros, months], joined by straight lines. */
const CURVE = [
	[0, 0], [4, 1], [8, 2], [12, 4], [16, 6], [20, 8], [22, 9], [24, 10], [26, 12],
] as const;

/** Euros → seconds of supporter on supporterMonths' curve, prorated between its steps
 *  (an itch.io donation can be any amount). */
export const supporterSeconds = (euros: number): number => {
	if (euros >= 26) return Math.floor(euros / 26 * 12 * MONTH_SECONDS);
	const i = CURVE.findIndex(([e]) => e > euros);
	if (i < 1) return 0;
	const [e0, m0] = CURVE[i - 1];
	const [e1, m1] = CURVE[i];
	return Math.floor((m0 + (euros - e0) / (e1 - e0) * (m1 - m0)) * MONTH_SECONDS);
};

/** Whole months in `seconds` of supporter, for the profile's hearts. */
export const wholeMonths = (seconds: number): number => Math.floor(seconds / MONTH_SECONDS);

/** The "save x%" against €4 a month; past a year it counts unrounded months, so it stays at 46%. */
export const supporterSaving = (euros: number): number =>
	euros >= 26 ? 1 - 26 / 48 : Math.max(0, 1 - euros / (supporterMonths(euros) * 4));

/** Profile hearts, osu-web's `User::supportLevel`: from every month of supporter ever received. */
export const supportLevel = (active: boolean, totalMonths: number): number => {
	if (!active) return 0;
	if (totalMonths < 12) return 1;
	if (totalMonths < 5 * 12) return 2;
	return 3;
};

export type RefundWindow = {
	amount: number;
	refunded: number;
	startsAt: Date | null;
	endsAt: Date | null;
	paymentIntent: string | null;
};

/** What is left to refund for the part of the tag not used yet, in euro cents. */
export const unusedRefund = (order: RefundWindow, now = Date.now()): number => {
	if (!order.startsAt || !order.endsAt || !order.paymentIntent) return 0;
	const window = order.endsAt.getTime() - order.startsAt.getTime();
	if (window <= 0) return 0;
	const unused = Math.max(0, order.endsAt.getTime() - Math.max(now, order.startsAt.getTime()));
	return Math.floor((order.amount - order.refunded) * Math.min(1, unused / window));
};

/** How much of its tag, in ms, an order loses to a refund of `share` of what is left on it:
 *  that share of its whole time, but never more than it still has to run. */
export const refundCut = (
	order: { startsAt: Date, endsAt: Date },
	share: number,
	now = Date.now(),
): number => {
	const window = order.endsAt.getTime() - order.startsAt.getTime();
	const left = order.endsAt.getTime() - Math.max(now, order.startsAt.getTime());
	return Math.max(0, Math.min(window * share, left));
};

export const checkoutBody = z.object({
	amount: z.number().int().min(MIN_SUPPORT).max(MAX_SUPPORT),
	// a gift; yourself when absent
	recipientId: z.number().int().positive().optional(),
	recurring: z.boolean(),
	// immediate access, the buyer gives up the 14-day withdrawal right
	waiver: z.literal(true),
});
export type CheckoutBody = z.infer<typeof checkoutBody>;

/** Admin: months given by hand. */
export const giveBody = z.object({ months: z.number().int().min(1).max(120) });

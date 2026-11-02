import {
	createHash,
	createHmac,
} from 'node:crypto';

import {
	eq,
	sql,
	sum,
} from 'drizzle-orm';

import {
	supporterSeconds,
	wholeMonths,
} from '@oss-idle/shared/supporter';

import { db } from './db/client';
import { itchDonations } from './db/schema/itch_donation';
import { users } from './db/schema/user';
import {
	env,
	ITCH_REDIRECT_URI,
} from './env';
import { supporterEvent } from './events';
import { tagStart } from './supporter';

const API = 'https://api.itch.io';

/** The PKCE verifier, rebuilt from the signed state so nothing is kept between the two legs. */
const verifier = (state: string) =>
	createHmac('sha256', env.JWT_SECRET).update(`itch:${state}`).digest('base64url');

export const itchAuthorizeUrl = (state: string): string => `https://itch.io/user/oauth?${new URLSearchParams({
	client_id: env.ITCH_CLIENT_ID,
	scope: 'profile:me',
	redirect_uri: ITCH_REDIRECT_URI,
	response_type: 'code',
	code_challenge: createHash('sha256').update(verifier(state)).digest('base64url'),
	code_challenge_method: 'S256',
	state,
})}`;

/** Trade an authorization code for the id of the itch.io account that granted it; the token
 *  is revoked right after, as nothing else needs it. */
export const fetchItchUserId = async (code: string, state: string): Promise<number> => {
	const client = env.ITCH_CLIENT_ID;
	const token = await fetch(`${API}/oauth/token`, {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			code_verifier: verifier(state),
			redirect_uri: ITCH_REDIRECT_URI,
			client_id: client,
		}),
	});
	if (!token.ok) throw new Error(`itch.io token exchange failed: ${token.status} ${await token.text()}`);
	const { access_token } = await token.json() as { access_token: string };
	try {
		const me = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${access_token}` } });
		if (!me.ok) throw new Error(`itch.io /profile failed: ${me.status}`);
		return (await me.json() as { user: { id: number } }).user.id;
	} finally {
		void fetch(`${API}/oauth/revoke`, {
			method: 'POST',
			body: new URLSearchParams({
				token: access_token, client_id: client,
			}),
		}).catch(() => undefined);
	}
};

type Purchase = {
	id: number;
	price: string;
	currency: string;
	status?: string;
	purchase_type?: string;
};

/** The completed, paid purchases of oss!idle itself (not of a bundle holding it) by an itch.io account. */
const purchasesOf = async (itchUserId: number): Promise<Purchase[]> => {
	const url = `${API}/games/${env.ITCH_GAME_ID}/purchases?user_id=${itchUserId}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${env.ITCH_API_KEY}` } });
	const body = await res.json() as { purchases?: Purchase[] | object; errors?: string[] };
	if (!res.ok || body.errors) throw new Error(`itch.io purchases: ${res.status} ${body.errors?.join(', ')}`);
	return (Array.isArray(body.purchases) ? body.purchases : []).filter(p =>
		(p.status ?? 'complete') === 'complete'
		&& (p.purchase_type ?? 'game') === 'game'
		&& price(p) > 0);
};

const price = (p: Purchase) => Number(p.price.replace(/[^\d.]/g, '')) || 0;

/** Euros for one unit of `currency`, at the ECB's reference rate of the day. */
const euroRate = async (currency: string): Promise<number> => {
	if (currency === 'EUR') return 1;
	if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Unknown currency ${currency}`);
	const xml = await (await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')).text();
	const rate = Number(new RegExp(`currency=['"]${currency}['"] rate=['"]([\\d.]+)`).exec(xml)?.[1]);
	if (!rate) throw new Error(`No ECB rate for ${currency}`);
	return 1 / rate;
};

/** One purchase lands as supporter time, once: extends the tag from now or from its end, and
 *  adds the whole months it completes to the profile's hearts. */
const land = async (userId: number, itchUserId: number, p: Purchase): Promise<number> => {
	const amount = Math.round(price(p) * await euroRate(p.currency) * 100);
	const seconds = supporterSeconds(amount / 100);
	return db.transaction(async tx => {
		await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
		const [{ total }] = await tx
			.select({ total: sum(itchDonations.seconds).mapWith(Number) })
			.from(itchDonations)
			.where(eq(itchDonations.userId, userId));
		const [{ affectedRows }] = await tx.insert(itchDonations).ignore().values({
			purchaseId: p.id, userId, itchUserId, price: p.price, currency: p.currency, amount, seconds,
		});
		if (!affectedRows) return 0;
		const before = total ?? 0;
		await tx.update(users).set({
			supporterUntil: sql`DATE_ADD(${tagStart}, INTERVAL ${seconds} SECOND)`,
			supporterMonths: sql`${users.supporterMonths} + ${wholeMonths(before + seconds) - wholeMonths(before)}`,
		}).where(eq(users.id, userId));
		return seconds;
	});
};

/** Claims every itch.io donation of `itchUserId` not claimed yet for the account; the seconds of
 *  supporter they gave. */
export const claimItch = async (userId: number, itchUserId: number): Promise<number> => {
	const [user] = await db
		.select({ restricted: users.restrictedAt })
		.from(users)
		.where(eq(users.id, userId));
	if (!user || user.restricted) throw new Error(`itch.io claim for account ${userId}, missing or restricted`);
	let seconds = 0;
	for (const p of await purchasesOf(itchUserId)) seconds += await land(userId, itchUserId, p);
	if (seconds) await supporterEvent(userId, false);
	return seconds;
};

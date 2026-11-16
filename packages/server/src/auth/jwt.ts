import {
	sign,
	verify,
} from 'hono/jwt';

import { env } from '../env';

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, seconds
const STATE_TTL = 60 * 5; // 5 minutes, seconds

export interface SessionPayload {
	uid: number;
	username: string;
}

const now = () => Math.floor(Date.now() / 1000);

/** Sign our session JWT (stored in the HttpOnly cookie). */
export function signSession(user: { id: number; username: string }): Promise<string> {
	return sign({
		uid: user.id, username: user.username, iat: now(), exp: now() + SESSION_TTL, 
	}, env.JWT_SECRET);
}

/** Verify the session JWT; throws if invalid or expired. */
export async function verifySession(token: string): Promise<SessionPayload> {
	const payload = await verify(token, env.JWT_SECRET, 'HS256');
	// the OAuth and Discord link states are signed with the same secret
	if (!Number.isInteger(payload.uid) || payload.link !== undefined) {
		throw new Error('Not a session');
	}
	return {
		uid: payload.uid as number, username: payload.username as string, 
	};
}

/** Where the OAuth round-trip was started from, so the callback knows whether to
 *  set a browser cookie (web) or hand a token back to the desktop app. */
export type OAuthClient = 'web' | 'desktop';

/** Where the desktop app waits for its sign-in: a port on its own loopback, and a key it
 *  checks the answer against (RFC 8252). */
export type DesktopReturn = { port: number; key: string };

/** Short-lived signed CSRF state for the OAuth round-trip, tagged with the client
 *  that started it. Desktop also carries where the app waits, so the callback can
 *  send it the one-time code there. */
export function signState(client: OAuthClient, desktop?: DesktopReturn): Promise<string> {
	return sign({
		nonce: crypto.randomUUID(), client, ...desktop, iat: now(), exp: now() + STATE_TTL, 
	}, env.JWT_SECRET);
}

/** Verify the CSRF state and recover the client tag, nonce, and where the desktop
 *  app waits; throws if invalid/expired. */
export async function verifyState(
	state: string,
): Promise<{ client: OAuthClient; nonce: string; desktop?: DesktopReturn }> {
	const payload = await verify(state, env.JWT_SECRET, 'HS256');
	const desktop = typeof payload.port === 'number' && typeof payload.key === 'string'
		? {
			port: payload.port, key: payload.key,
		}
		: undefined;
	return {
		client: payload.client === 'desktop' ? 'desktop' : 'web',
		nonce: payload.nonce as string,
		desktop,
	};
}

type Link = 'discord' | 'itch' | 'twitch';

/** State for linking a Discord, itch.io or Twitch account: names the signed-in account, since the
 *  round-trip may run in a browser that holds no session (desktop). */
export const signLinkState = (uid: number, link: Link = 'discord'): Promise<string> => sign({
	nonce: crypto.randomUUID(), uid, link, iat: now(), exp: now() + STATE_TTL,
}, env.JWT_SECRET);

export const verifyLinkState = async (
	state: string,
	link: Link = 'discord',
): Promise<{ uid: number; nonce: string }> => {
	const payload = await verify(state, env.JWT_SECRET, 'HS256');
	if (payload.link !== link) throw new Error('Not a link state');
	return {
		uid: payload.uid as number, nonce: payload.nonce as string,
	};
};

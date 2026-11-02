import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { env } from '../env';
import { verifySession } from './jwt';

export const SESSION_COOKIE = env.SESSION_COOKIE_NAME;

/** The session JWT, from the HttpOnly cookie (web) or a `Bearer` header (the
 *  desktop app, which can't ride a cross-origin cookie and holds the token
 *  itself). Both carry the exact same session JWT - see {@link signSession}. */
function sessionToken(c: Context): string | undefined {
	const auth = c.req.header('Authorization');
	if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
	return getCookie(c, SESSION_COOKIE);
}

/** The signed-in user id, or undefined when the caller has no valid session.
 *  For routes that are public but render differently once signed in. */
export const sessionUserId = async (c: Context): Promise<number | undefined> => {
	const token = sessionToken(c);
	if (!token) return undefined;
	try {
		return (await verifySession(token)).uid;
	} catch {
		return undefined;
	}
};

/** Require a valid session (cookie or Bearer); exposes the user id as `c.get('userId')`. */
export const requireAuth = createMiddleware<{ Variables: { userId: number } }>(async (c, next) => {
	const token = sessionToken(c);
	if (!token) throw new HTTPException(401, { message: 'Not authenticated' });

	try {
		const { uid } = await verifySession(token);
		c.set('userId', uid);
	} catch {
		throw new HTTPException(401, { message: 'Invalid session' });
	}

	await next();
});

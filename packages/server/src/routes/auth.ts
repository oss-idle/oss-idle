import {
	and,
	eq,
	ne,
} from 'drizzle-orm';
import {
	type Context,
	Hono,
} from 'hono';
import {
	deleteCookie,
	getCookie,
	setCookie,
} from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	discordAuthorizeUrl,
	fetchDiscordId,
} from '../auth/discord';
import {
	claimStateNonce,
	storeHandoff,
	takeHandoff,
} from '../auth/handoff';
import {
	type DesktopReturn,
	signLinkState,
	signSession,
	signState,
	verifyLinkState,
	verifyState,
} from '../auth/jwt';
import {
	requireAuth,
	SESSION_COOKIE,
	sessionUserId,
} from '../auth/middleware';
import {
	authorizeUrl,
	exchangeCode,
	fetchOsuUser,
} from '../auth/osu';
import { pushCharacter } from '../character/push';
import { db } from '../db/client';
import {
	getUserById,
	toUserDTO,
	users,
} from '../db/schema/user';
import {
	clientUrl,
	cookieSecure,
	isProd,
	SESSION_COOKIE_DOMAIN,
} from '../env';
import { env } from '../env';
import {
	groupsOf,
	nominatesOf,
} from '../groups';
import { count } from '../metrics';
import { valid } from '../validate';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, seconds

/** The cookie's domain for this request: every oss!idle host in prod, else this host. */
const cookieDomain = (c: Context): string | undefined => {
	const host = c.req.header('host')?.split(':')[0];
	return isProd && host?.endsWith(SESSION_COOKIE_DOMAIN) ? SESSION_COOKIE_DOMAIN : undefined;
};

const setSession = (c: Context, session: string) => {
	const domain = cookieDomain(c);
	// the host-only cookie from before the edges, which would shadow this one
	if (domain) deleteCookie(c, SESSION_COOKIE, { path: '/' });
	setCookie(c, SESSION_COOKIE, session, {
		httpOnly: true,
		sameSite: 'Lax',
		secure: cookieSecure,
		path: '/',
		maxAge: SESSION_MAX_AGE,
		domain,
	});
};

/** A move's code outlives a background tab's throttled timers. */
const MOVE_TTL_MS = 10 * 60_000;

const discordLevelColourBody = z.object({ levelColour: z.boolean() });

const desktopReturn = z.object({
	port: z.coerce.number().int().min(1024).max(65535),
	key: z.string().regex(/^[\w-]{16,64}$/),
});

/**
 * osu! OAuth (authorization-code) used only to verify/register the player. On
 * success we set our own HttpOnly session cookie; the client never touches the
 * osu! API afterwards. Chained so the routes land in the exported AppType.
 */
export const authRoutes = new Hono()
	// Entry point → osu! authorize (with signed CSRF state). `?client=desktop`
	// tags the round-trip so the callback hands the session to the desktop app
	// instead of setting a browser cookie.
	.get('/osu/login', async c => {
		if (c.req.query('client') !== 'desktop') return c.redirect(authorizeUrl(await signState('web')));
		// Desktop waits on its own loopback; carry where (signed) through the round-trip.
		const desktop = desktopReturn.safeParse({
			port: c.req.query('port'), key: c.req.query('key'),
		});
		// an app from before the loopback sign-in: its update banner is already up
		if (!desktop.success) return c.redirect(`${clientUrl}/web/auth/error`);
		return c.redirect(authorizeUrl(await signState('desktop', desktop.data)));
	})

	// osu! redirects back here with ?code&state.
	.get('/osu/callback', async c => {
		const code = c.req.query('code');
		const state = c.req.query('state');
		if (!code || !state) throw new HTTPException(400, { message: 'Missing code or state' });

		let client: 'web' | 'desktop';
		let nonce: string;
		let desktop: DesktopReturn | undefined;
		try {
			({ client, nonce, desktop } = await verifyState(state));
		} catch {
			throw new HTTPException(400, { message: 'Invalid or expired state' });
		}

		// The system browser tab can re-fire this callback (reload, back/forward,
		// prefetch) after the deep-link redirect; osu! revokes the auth code on the
		// first exchange, so a second attempt would 500. Claim the nonce once and
		// send any replay to a benign page - the first hit already finished auth.
		if (!await claimStateNonce(nonce)) return c.redirect(`${clientUrl}/web/auth/callback`);

		const accessToken = await exchangeCode(code);
		const osu = await fetchOsuUser(accessToken);
		count('activity', 'logins');

		await db
			.insert(users)
			.values({
				id: osu.id, username: osu.username, avatarUrl: osu.avatar_url, country: osu.country_code, 
			})
			.onDuplicateKeyUpdate({
				set: {
					username: osu.username, avatarUrl: osu.avatar_url, country: osu.country_code, 
				}, 
			});

		const session = await signSession({
			id: osu.id, username: osu.username, 
		});

		// Desktop: a browser cookie wouldn't reach the app, so the session waits under
		// a one-time code, sent to the app's loopback in this same browser. It can only
		// reach the machine that signed in, whoever started the login.
		if (client === 'desktop') {
			if (!desktop) return c.redirect(`${clientUrl}/web/auth/error`);
			const handoff = crypto.randomUUID();
			await storeHandoff(handoff, session);
			const back = new URL(`http://127.0.0.1:${desktop.port}/callback`);
			back.searchParams.set('code', handoff);
			back.searchParams.set('key', desktop.key);
			return c.redirect(back.toString());
		}

		setSession(c, session);

		// Back to the same-origin /web page, which pings the game and closes.
		return c.redirect(`${clientUrl}/web/auth/callback`);
	})

	// Desktop OAuth hand-off: swap a one-time code for the session token. The app
	// then holds the token and sends it as a Bearer header on every API call.
	.post('/osu/desktop/exchange', async c => {
		const { code } = await c.req.json().catch(() => ({ code: undefined })) as { code?: string };
		if (!code) throw new HTTPException(400, { message: 'Missing code' });
		const token = await takeHandoff(code);
		if (!token) throw new HTTPException(401, { message: 'Invalid or expired code' });
		return c.json({ token });
	})

	// The move from osu.idle to oss.idle (shared/src/hostMove.ts): the old host's
	// page swaps its session cookie for a one-time code, and the new host's
	// move.html redeems it for a cookie of its own.
	.post('/move', async c => {
		const session = getCookie(c, SESSION_COOKIE);
		if (!session || !await sessionUserId(c)) throw new HTTPException(401, { message: 'Not signed in' });
		const code = crypto.randomUUID();
		await storeHandoff(code, session, MOVE_TTL_MS);
		return c.json({ code });
	})
	.post('/move/redeem', async c => {
		const { code } = await c.req.json().catch(() => ({ code: undefined })) as { code?: string };
		const session = code ? await takeHandoff(code) : null;
		if (!session) throw new HTTPException(401, { message: 'Invalid or expired code' });
		setSession(c, session);
		return c.json({ ok: true });
	})

	// Current session → user profile (cookie- or Bearer-authenticated).
	.get('/me', requireAuth, async c => {
		const [row] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1);
		if (!row) throw new HTTPException(401, { message: 'User not found' });
		// a session from before the edges moves onto the cookie they can read too
		const cookie = getCookie(c, SESSION_COOKIE);
		if (cookie && !c.req.header('Authorization') && cookieDomain(c)) setSession(c, cookie);
		return c.json(toUserDTO(row, await groupsOf(row.id), await nominatesOf(row.id)));
	})

	// Discord link: whether one is linked, and a fresh URL to link (or relink) one.
	.get('/discord', requireAuth, async c => {
		if (!env.DISCORD_CLIENT_SECRET) throw new HTTPException(503, { message: 'Discord linking is not configured' });
		const user = await getUserById(c.get('userId'));
		if (!user) throw new HTTPException(401, { message: 'User not found' });
		return c.json({
			linked: !!user.discordId,
			levelColour: user.discordLevelColour,
			url: discordAuthorizeUrl(await signLinkState(user.id)),
		});
	})

	.put('/discord/level-colour', requireAuth, valid('json', discordLevelColourBody), async c => {
		const uid = c.get('userId');
		const { levelColour } = c.req.valid('json');
		await db.update(users).set({ discordLevelColour: levelColour }).where(eq(users.id, uid));

		// The bot listens for character pushes, so this swaps the role right away.
		const user = await getUserById(uid);
		if (user?.currentCharacter) await pushCharacter(user.currentCharacter);

		return c.json({ levelColour });
	})

	.get('/discord/callback', async c => {
		const code = c.req.query('code');
		const state = c.req.query('state');
		if (!code || !state) return c.redirect(`${clientUrl}/web/auth/error`);

		let uid: number;
		let nonce: string;
		try {
			({ uid, nonce } = await verifyLinkState(state));
		} catch {
			throw new HTTPException(400, { message: 'Invalid or expired state' });
		}
		if (!await claimStateNonce(nonce)) return c.redirect(`${clientUrl}/web/auth/discord`);

		const discordId = await fetchDiscordId(code);
		// One oss!idle account per Discord account: a relink moves it.
		await db.update(users)
			.set({ discordId: null })
			.where(and(eq(users.discordId, discordId), ne(users.id, uid)));
		await db.update(users).set({ discordId }).where(eq(users.id, uid));

		// The bot listens for character pushes, so this gives the role right away.
		const user = await getUserById(uid);
		if (user?.currentCharacter) await pushCharacter(user.currentCharacter);

		return c.redirect(`${clientUrl}/web/auth/discord`);
	})

	.post('/logout', c => {
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		const domain = cookieDomain(c);
		if (domain) deleteCookie(c, SESSION_COOKIE, {
			path: '/', domain, 
		});
		return c.json({ ok: true });
	});

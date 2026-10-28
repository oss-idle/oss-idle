import {
	createHash,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto';

import {
	and,
	eq,
	gt,
	isNull,
	lt,
	or,
} from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import {
	parseScopes,
	type Scope,
	SCOPES,
} from '@oss-idle/shared/oauth';

import { sessionUserId } from './auth/middleware';
import { db } from './db/client';
import {
	type OAuthClientRow,
	oauthClients,
	oauthTokens,
} from './db/schema/oauth';
import { isRestricted } from './db/schema/user';
import { redisKeyPrefix } from './env';
import { redis } from './redis';

const ACCESS_TTL = 24 * 60 * 60; // seconds, osu!'s
const REFRESH_TTL = 30 * 24 * 60 * 60;
const CODE_TTL = 10 * 60;

export const randomSecret = () => randomBytes(32).toString('hex');

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const sameString = (a: string, b: string) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};

export const redirectsOf = (client: Pick<OAuthClientRow, 'redirect'>) =>
	client.redirect.split('\n');

const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

/** What an authorization code stands for until it is exchanged. */
type CodeGrant = { clientId: number; userId: number; scopes: Scope[]; redirectUri: string };

const codeKey = (code: string) => `${redisKeyPrefix}oauth:code:${sha256(code)}`;

export const createCode = async (grant: CodeGrant): Promise<string> => {
	const code = randomBytes(32).toString('base64url');
	await redis.set(codeKey(code), JSON.stringify(grant), 'EX', CODE_TTL);
	return code;
};

const takeCode = async (code: string): Promise<CodeGrant | undefined> => {
	const raw = await redis.getdel(codeKey(code));
	return raw ? JSON.parse(raw) as CodeGrant : undefined;
};

const issueToken = async (clientId: number, userId: number | undefined, scopes: Scope[]) => {
	const now = new Date();
	await db.delete(oauthTokens).where(and(
		lt(oauthTokens.expiresAt, now),
		or(isNull(oauthTokens.refreshExpiresAt), lt(oauthTokens.refreshExpiresAt, now)),
	));
	const access = randomBytes(40).toString('base64url');
	const refresh = userId === undefined ? undefined : randomBytes(40).toString('base64url');
	await db.insert(oauthTokens).values({
		id: sha256(access),
		refresh: refresh && sha256(refresh),
		clientId,
		userId,
		scopes: scopes.join(' '),
		expiresAt: later(ACCESS_TTL),
		refreshExpiresAt: refresh ? later(REFRESH_TTL) : undefined,
	});
	return {
		token_type: 'Bearer',
		expires_in: ACCESS_TTL,
		access_token: access,
		...refresh && { refresh_token: refresh },
	};
};

type Grant = Awaited<ReturnType<typeof issueToken>>;

/** An OAuth error, as RFC 6749 words it. */
type GrantError = { error: string; error_description: string };

const refused = (error: string, description: string): GrantError => ({
	error, error_description: description,
});

type Body = Record<string, string>;

const formOrJson = async (c: Context): Promise<Body> => {
	const body = c.req.header('content-type')?.includes('application/json')
		? await c.req.json().catch(() => ({}))
		: await c.req.parseBody();
	return Object.fromEntries(Object.entries(body as object)
		.filter(([, v]) => typeof v === 'string' || typeof v === 'number')
		.map(([k, v]) => [k, String(v)]));
};

const authenticateClient = async (body: Body) => {
	const id = Number(body.client_id);
	if (!Number.isInteger(id) || !body.client_secret) return undefined;
	const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
	return client && sameString(client.secret, body.client_secret) ? client : undefined;
};

const clientCredentials = async (client: OAuthClientRow, body: Body) => {
	const scopes = parseScopes(body.scope ?? 'public');
	if (!scopes || scopes.some(s => s !== 'public')) {
		return refused('invalid_scope', 'Client credentials can only have the public scope');
	}
	return issueToken(client.id, undefined, ['public']);
};

const authorizationCode = async (client: OAuthClientRow, body: Body) => {
	const grant = body.code ? await takeCode(body.code) : undefined;
	if (!grant || grant.clientId !== client.id) {
		return refused('invalid_grant', 'The authorization code is invalid or has expired');
	}
	if (body.redirect_uri !== undefined && body.redirect_uri !== grant.redirectUri) {
		return refused('invalid_grant', 'The redirect_uri does not match the one authorized');
	}
	if (await isRestricted(grant.userId)) return refused('invalid_grant', 'The account is restricted');
	return issueToken(client.id, grant.userId, grant.scopes);
};

/** A refresh token is used once: its token is replaced by a new pair. */
const refreshToken = async (client: OAuthClientRow, body: Body) => {
	const [row] = body.refresh_token ? await db
		.select()
		.from(oauthTokens)
		.where(and(
			eq(oauthTokens.refresh, sha256(body.refresh_token)),
			eq(oauthTokens.clientId, client.id),
			gt(oauthTokens.refreshExpiresAt, new Date()),
		))
		.limit(1) : [];
	if (!row?.userId) return refused('invalid_grant', 'The refresh token is invalid or has expired');
	await db.delete(oauthTokens).where(eq(oauthTokens.id, row.id));
	if (await isRestricted(row.userId)) return refused('invalid_grant', 'The account is restricted');
	return issueToken(client.id, row.userId, parseScopes(row.scopes) ?? []);
};

type GrantHandler = (client: OAuthClientRow, body: Body) => Promise<Grant | GrantError>;

const GRANTS: Record<string, GrantHandler> = {
	client_credentials: clientCredentials,
	authorization_code: authorizationCode,
	refresh_token: refreshToken,
};

/** `POST /oauth/token`: osu!'s three grants. */
export const tokenRoutes = new Hono().post('/token', async c => {
	const body = await formOrJson(c);
	const client = await authenticateClient(body);
	if (!client) return c.json(refused('invalid_client', 'Client authentication failed'), 401);
	const grant = Object.hasOwn(GRANTS, body.grant_type) ? GRANTS[body.grant_type] : undefined;
	if (!grant) {
		return c.json(refused(
			'unsupported_grant_type',
			'grant_type must be client_credentials, authorization_code or refresh_token',
		), 400);
	}
	const answer = await grant(client, body);
	return 'error' in answer ? c.json(answer, 400) : c.json(answer);
});

/** `clientId` is unset for the game's own session: its add-ons call the API as the player. */
export type ApiToken = { clientId?: number; userId?: number; scopes: Scope[] };

type TokenEnv = { Variables: { token: ApiToken } };

const oauthToken = async (raw: string): Promise<ApiToken | undefined> => {
	const [row] = await db
		.select({
			clientId: oauthTokens.clientId, userId: oauthTokens.userId, scopes: oauthTokens.scopes,
		})
		.from(oauthTokens)
		.where(and(eq(oauthTokens.id, sha256(raw)), gt(oauthTokens.expiresAt, new Date())))
		.limit(1);
	return row && {
		clientId: row.clientId,
		userId: row.userId ?? undefined,
		scopes: parseScopes(row.scopes) ?? [],
	};
};

/** A valid Bearer token, or the game's session (cookie, or the desktop app's Bearer);
 *  `c.get('token')` tells whose. */
export const apiToken = createMiddleware<TokenEnv>(async (c, next) => {
	const auth = c.req.header('Authorization');
	const raw = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : undefined;
	let token = raw ? await oauthToken(raw) : undefined;
	if (!token) {
		const userId = await sessionUserId(c);
		token = userId === undefined ? undefined : {
			userId, scopes: [...SCOPES],
		};
	}
	if (!token) return c.json({ authentication: 'basic' }, 401);
	if (token.userId !== undefined && await isRestricted(token.userId)) {
		return c.json({ error: 'The account is restricted' }, 403);
	}

	c.set('token', token);
	await next();
});

/** The token must hold `scope`. */
export const needs = (scope: Scope) => createMiddleware<TokenEnv>(async (c, next) => {
	if (!c.get('token').scopes.includes(scope)) {
		return c.json({ error: `This request needs the ${scope} scope` }, 403);
	}
	await next();
});

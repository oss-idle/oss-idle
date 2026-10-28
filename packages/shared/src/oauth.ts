import { z } from 'zod';

/** osu!'s API scopes we have, and our own `simulate` (the sim API). `identify` comes with every
 *  user token. */
export const SCOPES = ['public', 'identify', 'friends.read', 'simulate'] as const;
export type Scope = typeof SCOPES[number];

/** Space-separated scopes, as OAuth sends them; unknown ones are refused. */
export const parseScopes = (raw: string | undefined): Scope[] | undefined => {
	const names = (raw ?? '').split(/[\s+]+/).filter(Boolean);
	if (!names.every(n => (SCOPES as readonly string[]).includes(n))) return undefined;
	return [...new Set(names as Scope[])];
};

export const MAX_REDIRECTS = 10;

/** Only http(s): a `javascript:` callback would run on the consent page. */
export const isCallbackUrl = (url: string) =>
	URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol);

/** `GET /api/v2/characters?ids[]=`: up to 10 character ids, like osu!'s `/users?ids[]=`. */
export const batchIds = z.array(z.coerce.number().int().positive()).max(10);

/** A developer's OAuth application: its name and the callback URLs it may send users back to. */
export const oauthClientBody = z.object({
	name: z.string().trim().min(1).max(100),
	redirect: z.array(z.url().max(512).refine(isCallbackUrl, 'Callback URLs must be http or https'))
		.min(1).max(MAX_REDIRECTS),
});
export type OAuthClientBody = z.infer<typeof oauthClientBody>;

/** Like osu!, an application's name cannot be changed: only its callback URLs. */
export const oauthClientUpdateBody = oauthClientBody.pick({ redirect: true });
export type OAuthClientUpdateBody = z.infer<typeof oauthClientUpdateBody>;

/** The consent page's answer to an authorization request. */
export const authorizeBody = z.object({
	client_id: z.coerce.number().int().positive(),
	redirect_uri: z.string().optional(),
	scope: z.string().optional(),
	state: z.string().max(1024).optional(),
	approve: z.boolean(),
});
export type AuthorizeBody = z.infer<typeof authorizeBody>;

import { fallback } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';

// Shared leaderboard search params. `-` prefix keeps this out of the route tree.
// `fallback` guards bad URLs (?page=foo) instead of tripping an error boundary;
// `.default` makes the param optional on Link `search`.
export const pageSearch = z.object({
	page: fallback(z.coerce
		.number()
		.int()
		.positive()
	, 1).default(1), 
	// only the signed-in player and their friends
	friends: fallback(z.boolean().optional(), undefined).optional(),
	// the server's first when left out
	ruleset: z.enum(RULESET_IDS).optional().catch(undefined),
});

export const pageCountrySearch = pageSearch.extend({ country: z.string().optional() });

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	RULESET_IDS,
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import { valid } from '../validate';
import { ENABLED_RULESETS } from './enabled';
import {
	enabledRulesets,
	queuedRuleset,
	rulesetFor,
} from './registry';
import type { ServerRuleset } from './ruleset';

export const rulesetId = z.enum(RULESET_IDS);

/** Declares `?ruleset=` on a route, so typed clients can pass it; {@link rulesetQuery} reads it. */
export const rulesetParam = valid('query', z.object({ ruleset: rulesetId.optional() }));

/** The ruleset a request asks about (`?ruleset=`): by default the character's pick, else
 *  this server's first. One it doesn't play is a 404, as osu! answers an unknown mode. */
export const rulesetQuery = (c: Context, character?: { ruleset: RulesetId }): ServerRuleset => {
	const asked = c.req.query('ruleset');
	if (asked === undefined) {
		return character && ENABLED_RULESETS.includes(character.ruleset)
			? rulesetFor(character.ruleset)
			: enabledRulesets()[0];
	}
	const id = rulesetId.safeParse(asked);
	if (!id.success || !ENABLED_RULESETS.includes(id.data)) {
		throw new HTTPException(404, { message: 'No such ruleset' });
	}
	return rulesetFor(id.data);
};

/** The ruleset a nomination request asks about (`?ruleset=`): any with a queue here, this
 *  server's first by default. Who may reach one players don't have yet is the route's. */
export const queueQuery = (c: Context): ServerRuleset => {
	const asked = c.req.query('ruleset');
	if (asked === undefined) return enabledRulesets()[0];
	const id = rulesetId.safeParse(asked);
	const r = id.success ? queuedRuleset(id.data) : undefined;
	if (!r) throw new HTTPException(404, { message: 'No such ruleset' });
	return r;
};

/** The ruleset an osu!-style API call asks about: osu!'s `mode` (in the path, or the
 *  query) and `variant` (mania's 4k / 7k), mania 4k when left out. */
export const apiRuleset = (c: Context): ServerRuleset => {
	const mode = c.req.param('mode') ?? c.req.query('mode') ?? 'mania';
	const variant = c.req.query('variant') ?? (mode === 'mania' ? '4k' : undefined);
	const id = RULESET_IDS.find(r => {
		const def: { mode: string, variant?: string } = RULESETS[r];
		return def.mode === mode && def.variant === variant;
	});
	if (!id || !ENABLED_RULESETS.includes(id)) throw new HTTPException(404, { message: 'No such ruleset' });
	return rulesetFor(id);
};

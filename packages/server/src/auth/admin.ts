import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import {
	type Group,
	isAdmin,
	isModerator,
	nominatesIn,
} from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	groupsOf,
	nominatesOf,
} from '../groups';
import { queueOfBeatmap } from '../rulesets/registry';
import { queueQuery } from '../rulesets/request';
import { requireAuth } from './middleware';

const requireGroups = (allowed: (groups: Group[]) => boolean) =>
	createMiddleware<{ Variables: { userId: number } }>(async (c, next) => {
		await requireAuth(c, async () => {
			if (!allowed(await groupsOf(c.get('userId')))) throw new HTTPException(403, { message: 'Forbidden' });
			await next();
		});
	});

/** May rank maps in `ruleset`. */
export const mayNominateIn = async (userId: number | undefined, ruleset: RulesetId) =>
	userId !== undefined && nominatesIn({
		groups: await groupsOf(userId), nominates: await nominatesOf(userId),
	}, ruleset);

/** A chart no ruleset here has a queue for is an admin's. */
const mayNominate = async (userId: number, ruleset?: RulesetId) =>
	ruleset ? mayNominateIn(userId, ruleset) : isAdmin(await groupsOf(userId));

const requireNominates = (
	rulesetIn: (c: Context) => RulesetId | undefined | Promise<RulesetId | undefined>,
) =>
	createMiddleware<{ Variables: { userId: number } }>(async (c, next) => {
		await requireAuth(c, async () => {
			if (!await mayNominate(c.get('userId'), await rulesetIn(c))) {
				throw new HTTPException(403, { message: 'Forbidden' });
			}
			await next();
		});
	});

/** A signed-in admin, or a Beatmap Nominator of the ruleset the request asks about. */
export const requireNominator = requireNominates(c => queueQuery(c).def.id);

/** A signed-in admin, or a Beatmap Nominator of the ruleset the `:beatmapId` difficulty is in. */
export const requireDiffNominator = requireNominates(c =>
	queueOfBeatmap(Number(c.req.param('beatmapId'))));

/** A signed-in admin. */
export const requireAdmin = requireGroups(isAdmin);

/** A signed-in admin or GMT member: sanctions and reports. */
export const requireModerator = requireGroups(isModerator);

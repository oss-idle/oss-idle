import { z } from 'zod';

import { RULESET_IDS } from './rulesets/ids.js';

/** The ruleset an action was bought in: its progression is that ruleset's alone. */
const ruleset = z.enum(RULESET_IDS);

/**
 * A character action a running play deferred. A play's outcome and its xp are
 * both decided when it starts, so anything that rewrites progression waits for
 * it to end rather than racing its finalise.
 *
 * They stack, and they are committed: buying during a play is a purchase, not a
 * proposal. Each one is still checked when it is applied, so an action the
 * character can no longer afford by the time its turn comes is simply dropped.
 */
export const pendingActionDTO = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('upgrade'),
		ruleset,
		skill: z.string(),
		requestedAt: z.number().int(),
	}),
	z.object({
		type: z.literal('prestige'),
		ruleset,
		skill: z.string(),
		force: z.boolean().optional(),
		requestedAt: z.number().int(),
	}),
	z.object({
		type: z.literal('rebirth'),
		ruleset,
		name: z.string(),
		requestedAt: z.number().int(),
	}),
]);
export type PendingAction = z.infer<typeof pendingActionDTO>;

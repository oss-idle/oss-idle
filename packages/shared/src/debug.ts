import { z } from 'zod';

import { STRAIN_CAP } from './fatigue.js';
import { modsSchema } from './mods.js';
import { rateSchema } from './rate.js';
import { Skills } from './rulesets/mania/4k/skills.js';

/** The highest level the debug knobs reach. */
export const DEBUG_MAX_LEVEL = 250;

const level = z.number().int().min(0).max(DEBUG_MAX_LEVEL);

/** Debug mode on a dev server: put 4K skills at these real levels and prestiges,
 *  and the character's fatigue at these strained minutes as of now (warm-up
 *  follows). */
export const debugCharacterBody = z.object({
	levels: z.partialRecord(z.enum(Skills), level).optional(),
	prestige: z.partialRecord(z.enum(Skills), z.number().int().min(0).max(50)).optional(),
	fatigueMinutes: z.number().min(0).max(STRAIN_CAP).optional(),
});
export type DebugCharacterBody = z.infer<typeof debugCharacterBody>;

/** The strain view's knobs on a dev server: a 4K play of `beatmapId` with these
 *  levels, prestiges, memory tries and strained minutes on the character's own
 *  progress, at this rate and mods. */
export const debugSimBody = z.object({
	beatmapId: z.number().int().positive(),
	rate: rateSchema,
	mods: modsSchema,
	levels: z.partialRecord(z.enum(Skills), level),
	prestige: z.partialRecord(z.enum(Skills), z.number().int().min(0).max(50)).optional(),
	timesPlayed: z.number().int().min(0),
	fatigueMinutes: z.number().min(0).max(STRAIN_CAP),
});
export type DebugSimBody = z.infer<typeof debugSimBody>;

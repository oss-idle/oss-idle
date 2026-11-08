import { z } from 'zod';

import { Grades } from './grade.js';
import { modsSchema } from './mods.js';
import { rateSchema } from './rate.js';

/** A play's count per judgement of its ruleset. */
export const judgementCountsDTO = z.record(z.string(), z.number().int().min(0));
export type JudgementCounts = z.infer<typeof judgementCountsDTO>;

export const scoreDTO = z.object({
	// 0: never submitted (an NF match round)
	id: z.number().int().min(0),
	// an unranked map's board keeps its plays apart: `id` counts in its own table
	unranked: z.boolean(),
	characterId: z.number().int().positive(),
	beatmapId: z.number().int(),
	score: z.number().int().min(0),
	// no ceiling: a ruleset can carry a pure play past 100% (mania's divine)
	accuracy: z.number().min(0),
	maxCombo: z.number().int().min(0),
	judgements: judgementCountsDTO,
	grade: z.enum(Grades),
	pp: z.number().min(0),
	ur: z.number().min(0),
	pfc: z.boolean(),
	rate: rateSchema,
	mods: modsSchema.default([]),
	playedAt: z.number().int(), // epoch ms
	/** XP earned per skill that gained: only on the account's own synced plays */
	gains: z.record(z.string(), z.number()).optional(),
});
export type ScoreDTO = z.infer<typeof scoreDTO>;

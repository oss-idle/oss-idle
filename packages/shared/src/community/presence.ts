import { z } from 'zod';

import {
	characterDTO,
	characterStatsDTO,
} from '../character.js';
import {
	mapped,
	type ValueIn,
	values,
} from '../helpers/mapped.js';

export const STATUS = mapped(['idle', 'afk', 'playing']);
export type Status = ValueIn<typeof STATUS>;

/** Statuses a client may report for itself. `playing` is server-driven (set
 *  from the authoritative play), never sent by the client. */
export const CLIENT_STATUS = mapped(['idle', 'afk']);
export type ClientStatus = ValueIn<typeof CLIENT_STATUS>;

/** A point on the world map. Coarse, rounded projected coordinates (0..1 of the
 *  map rect) - never raw lat/lng, so a player's real location never leaves the
 *  server. */
export const mapPointDTO = z.object({
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
});
export type MapPoint = z.infer<typeof mapPointDTO>;

/** One online character in one ruleset, as broadcast to every connected client:
 *  an account lists each of its slots that is playing. Composed from the
 *  character's identity + headline stats in that ruleset (reused from
 *  `character.ts`, not redeclared) plus the live presence fields (rank, status,
 *  location). */
export const presenceEntryDTO = characterDTO
	.pick({
		name: true, avatarUrl: true,
	})
	.extend({
		/** 4K when left out, as entries were before rulesets played side by side */
		ruleset: characterDTO.shape.ruleset.optional(),
		...characterStatsDTO.shape,
		characterId: z.number().int().positive(),
		userId: z.number().int().positive(),
		country: z.string(),
		rank: z.number().int().min(0).optional(),
		/** 0..1: the share of players with pp at or above `rank`, for its tier */
		rankPercent: z.number().min(0).max(1).optional(),
		status: z.enum(values(STATUS)),
		nowPlaying: z.string().optional(),
		loc: mapPointDTO.optional(),
		tz: z.string().optional(),
	});
export type PresenceEntry = z.infer<typeof presenceEntryDTO>;

/** What names an entry on the roster: its character in its ruleset. */
export const presenceKey = (entry: Pick<PresenceEntry, 'characterId' | 'ruleset'>): string =>
	`${entry.characterId}:${entry.ruleset ?? 'mania4k'}`;

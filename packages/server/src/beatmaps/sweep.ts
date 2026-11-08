import {
	and,
	eq,
	inArray,
	lte,
	sql,
} from 'drizzle-orm';

import { APPROVED_STATUSES } from '@oss-idle/shared/beatmap';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';

import { db } from '../db/client';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { mapperEvent } from '../events';
import { recordCurators } from '../medals';
import { enabledRulesets } from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';
import { announceRanked } from './announce';
import {
	diffsOf,
	flushCatalogInvalidate,
	invalidateCatalog,
	withStatus,
} from './catalog';

/**
 * Announce scheduled maps whose rank time has passed. Runs on the periodic
 * sweep (see index.ts) so a future-dated map goes live + announces with no
 * redeploy. Safe across the pm2 cluster: the announce is gated on atomically
 * flipping `announced` false->true, so exactly one worker fires the webhook.
 */
export const sweepRankedMaps = async (): Promise<void> => {
	let wentLive = false;
	for (const r of enabledRulesets()) wentLive = await announceDue(r) || wentLive;

	// Tell connected clients the catalog grew, so song select refetches it.
	if (wentLive) await invalidateCatalog();
	else await flushCatalogInvalidate();
};

/** Announce a ruleset's maps that just went live there; whether any did. */
const announceDue = async (r: ServerRuleset): Promise<boolean> => {
	const { setStatus } = r;
	const due = await db
		.select({
			set: beatmapset, status: setStatus.status, 
		})
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.where(and(
			inArray(setStatus.status, [...APPROVED_STATUSES]),
			eq(setStatus.announced, false),
			lte(setStatus.rankedAt, sql`now()`),
		));

	let wentLive = false;
	for (const { set, status } of due) {
		const [claim] = await db
			.update(setStatus)
			.set({ announced: true })
			.where(and(eq(setStatus.setId, set.id), eq(setStatus.announced, false)));
		if (!claim.affectedRows) continue;
		wentLive = true;
		await recordCurators(r, set);
		await mapperEvent(set.ownerUserId, r.def.id, {
			type: 'beatmapsetApprove', setId: set.id, status: status === 'loved' ? 'loved' : 'ranked',
		});

		const diffs = await db
			.select({
				version: beatmaps.version, sr: beatmaps.sr, background: beatmaps.background,
			})
			.from(beatmaps)
			.where(and(
				eq(beatmaps.setId, set.id), eq(beatmaps.ranked, true), diffsOf(r),
			));

		await announceRanked({
			loved: status === 'loved',
			ruleset: rulesetLabel(r.def.id),
			id: set.id,
			osuId: set.osuId,
			osuCover: set.osuCover,
			background: diffs.find(d => d.background)?.background,
			artist: set.artist,
			title: set.title,
			creator: set.creator,
			difficulties: diffs.map(d => ({
				version: d.version, sr: Number(d.sr), 
			})),
		});
	}
	return wentLive;
};

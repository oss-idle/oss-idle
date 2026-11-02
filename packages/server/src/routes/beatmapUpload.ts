import {
	and,
	eq,
	ne,
} from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { INTRO_SET_ID } from '@oss-idle/shared/beatmap';

import { requireActive } from '../auth/active';
import { requireAuth } from '../auth/middleware';
import { invalidateCatalog } from '../beatmaps/catalog';
import { ingestOsz } from '../beatmaps/ingest';
import {
	statusesOf,
	statusIn,
} from '../beatmaps/setStatus';
import { deleteSetFiles } from '../beatmaps/storage';
import {
	openBoard,
	wipeUnrankedScores,
} from '../beatmaps/unrankedBoard';
import {
	gateUpload,
	ownSetOfFile,
	submitForRank,
	unrankOwn,
	UploadRefused,
	uploadTarget,
	withdrawFromRank,
} from '../beatmaps/upload';
import { db } from '../db/client';
import { beatmapset } from '../db/schema/beatmapset';
import { redisKeyPrefix } from '../env';
import { addEvent } from '../events';
import { redis } from '../redis';
import { rulesetQuery } from '../rulesets/request';
import { isSupporter } from '../supporter';
import { idParam } from '../validate';


/** The uploaded .osz, from the multipart `file` field. */
const oszOf = async (c: Context): Promise<Buffer> => {
	const file = (await c.req.parseBody())['file'];
	if (!(file instanceof File)) throw new UploadRefused('No .osz file provided', 'invalid');
	return Buffer.from(await file.arrayBuffer());
};

/** A supporter's map always has a leaderboard. */
const boardForSupporters = async (userId: number, setId: number) => {
	if (await isSupporter(userId)) await openBoard(setId);
};

/** One upload or submission at a time per player: two uploads at once would both pass
 *  the monthly quota, and an upload finishing after a submission would unqueue it. */
const locked = async <T>(userId: number, run: () => Promise<T>): Promise<T> => {
	const lock = `${redisKeyPrefix}upload:${userId}`;
	if (!await redis.set(lock, '1', 'EX', 120, 'NX')) {
		throw new UploadRefused('Another upload of yours is under way', 'busy');
	}
	return run().finally(() => redis.del(lock));
};

/** An upload the gate turned down, as a 422 with the difficulties and what is wrong with them. */
const refused = (c: Context, e: unknown) => {
	if (!(e instanceof UploadRefused)) throw e;
	return c.json({
		error: e.message, code: e.code, problems: e.problems,
	}, 422);
};

/**
 * Players' own maps. An upload goes where its files say (see uploadTarget): over the
 * player's own set, or up as a new `unranked` one (public, theirs to replace or take
 * down), once it passes the editor's map checks. The answer carries the ids now
 * written into its files, for the editor to keep.
 */
export const beatmapUploadRoutes = new Hono<{ Variables: { userId: number } }>()
	.post('/', requireActive, async c => {
		try {
			const userId = c.get('userId');
			const osz = await oszOf(c);
			const { target, result } = await locked(userId, async () => {
				const target = await uploadTarget(gateUpload(osz), userId);
				// the old version's scores go, the ones of difficulties it drops too
				if (target.setId !== undefined) await wipeUnrankedScores(target.setId);
				const result = await ingestOsz(osz, {
					owner: {
						userId, ...target,
					},
				});
				return {
					target, result, 
				};
			});
			await boardForSupporters(userId, result.setId);
			await addEvent({ userId }, {
				type: target.setId === undefined ? 'beatmapsetUpload' : 'beatmapsetUpdate', setId: result.setId,
			});
			return c.json({
				setId: result.setId, updated: target.setId !== undefined, ids: result.ids,
			});
		} catch (e) {
			return refused(c, e);
		}
	})
	// the player's own set a file's BeatmapSetID names, and where it stands (a planned
	// rank's date is secret)
	.get('/of/:fileSetId', requireAuth, async c => {
		try {
			const set = await ownSetOfFile(idParam.parse(c.req.param('fileSetId')), c.get('userId'));
			const status = await statusIn(rulesetQuery(c), set.id);
			return c.json({
				setId: set.id,
				status: status?.status ?? 'unranked',
				scheduled: !!status?.rankedAt && status.rankedAt.getTime() > Date.now(),
				reviewNote: status?.reviewNote ?? undefined,
			});
		} catch (e) {
			return refused(c, e);
		}
	})
	.post('/:setId/unrank', requireAuth, async c => {
		try {
			await unrankOwn(rulesetQuery(c), idParam.parse(c.req.param('setId')), c.get('userId'));
			await invalidateCatalog();
			return c.json({ ok: true });
		} catch (e) {
			return refused(c, e);
		}
	})
	.post('/:setId/submit', requireActive, async c => {
		try {
			const userId = c.get('userId');
			const r = rulesetQuery(c);
			await locked(userId, () => submitForRank(r, idParam.parse(c.req.param('setId')), userId));
			return c.json({ ok: true });
		} catch (e) {
			return refused(c, e);
		}
	})
	.post('/:setId/withdraw', requireAuth, async c => {
		try {
			await withdrawFromRank(rulesetQuery(c), idParam.parse(c.req.param('setId')), c.get('userId'));
			return c.json({ ok: true });
		} catch (e) {
			return refused(c, e);
		}
	})
	.delete('/:setId', requireAuth, async c => {
		const userId = c.get('userId');
		const id = idParam.parse(c.req.param('setId'));
		// unranked in every ruleset: a ruleset that ranked or queued it keeps it
		const unranked = (await statusesOf(id)).every(([, s]) => s.status === 'unranked');
		const [res] = unranked ? await db.update(beatmapset).set({ deletedAt: new Date() }).where(and(
			eq(beatmapset.id, id), ne(beatmapset.id, INTRO_SET_ID), eq(beatmapset.ownerUserId, userId),
		)) : [{ affectedRows: 0 }];
		if (!res.affectedRows) throw new HTTPException(404, { message: 'Not one of your unranked maps' });
		await wipeUnrankedScores(id);
		await deleteSetFiles(id);
		return c.json({ ok: true });
	});

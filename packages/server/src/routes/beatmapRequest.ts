import {
	and,
	count,
	eq,
	inArray,
	isNull,
} from 'drizzle-orm';
import {
	type Context,
	Hono,
} from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { INTRO_SET_ID } from '@oss-idle/shared/beatmap';
import {
	beatmapRequestBody,
	beatmapRequestPatch,
	maxPendingRequests,
	parseBeatmapsetId,
} from '@oss-idle/shared/beatmapRequest';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import { rulesetOf } from '@oss-idle/shared/rulesets/ids';

import { requireActive } from '../auth/active';
import {
	mayNominateIn,
	requireNominator,
} from '../auth/admin';
import {
	requireAuth,
	sessionUserId,
} from '../auth/middleware';
import { ingestOsz } from '../beatmaps/ingest';
import { downloadOsz } from '../beatmaps/mirror';
import { db } from '../db/client';
import { beatmapset } from '../db/schema/beatmapset';
import { users } from '../db/schema/user';
import {
	getManiaSet,
	searchManiaSets,
} from '../db/stats';
import {
	fetchBeatmapset,
	SchedulerError,
} from '../osu/api';
import { ENABLED_RULESETS } from '../rulesets/enabled';
import { queuedRulesets } from '../rulesets/registry';
import {
	queueQuery,
	rulesetId,
	rulesetParam,
} from '../rulesets/request';
import type { ServerRuleset } from '../rulesets/ruleset';
import { isSupporter } from '../supporter';
import {
	idParam,
	valid,
} from '../validate';


/** The ruleset a request is about; one players don't have yet only for its nominators. */
const requestRuleset = async (c: Context): Promise<ServerRuleset> => {
	const r = queueQuery(c);
	if (ENABLED_RULESETS.includes(r.def.id) || await mayNominateIn(await sessionUserId(c), r.def.id)) {
		return r;
	}
	throw new HTTPException(404, { message: 'No such ruleset' });
};

/** Metadata for a set nobody has requested yet: the stats mirror first (free,
 *  local), then osu! itself for anything it doesn't carry - which is also what
 *  proves the set exists and has a difficulty in the ruleset. */
const resolveSet = async (r: ServerRuleset, setId: number) => {
	const local = await getManiaSet(r, setId);
	if (local) return local;

	let set;
	try {
		set = await fetchBeatmapset(setId);
	} catch (e) {
		if (e instanceof SchedulerError) {
			throw new HTTPException(503, { message: 'osu! lookup is unavailable right now, try again later' });
		}
		throw e;
	}
	if (!set) throw new HTTPException(404, { message: 'No beatmapset with that id' });

	const diffs = (set.beatmaps ?? [])
		.filter(b => rulesetOf(b.mode_int, Math.round(b.cs)) === r.def.id);
	if (!diffs.length) {
		throw new HTTPException(400, { message: `Only osu!mania ${rulesetLabel(r.def.id)} maps can be ranked here` });
	}

	const srs = diffs.map(b => b.difficulty_rating);
	return {
		setId,
		artist: set.artist,
		title: set.title,
		creator: set.creator,
		diffs: diffs.length,
		srMin: Math.min(...srs),
		srMax: Math.max(...srs),
	};
};

/** Every request, with its backer count, the requester, and - once ingested -
 *  the nomination state of the matching set. */
const listRequests = async (r: ServerRuleset, viewerId?: number) => {
	const rows = await db
		.select({
			setId: r.requests.setId,
			userId: r.requests.userId,
			artist: r.requests.artist,
			title: r.requests.title,
			creator: r.requests.creator,
			status: r.requests.status,
			note: r.requests.note,
			createdAt: r.requests.createdAt,
			resolvedAt: r.requests.resolvedAt,
			username: users.username,
			avatarUrl: users.avatarUrl,
			setStatus: r.setStatus.status,
			rankedAt: r.setStatus.rankedAt,
		})
		.from(r.requests)
		.leftJoin(users, eq(users.id, r.requests.userId))
		.leftJoin(beatmapset, and(
			eq(beatmapset.osuId, r.requests.setId),
			isNull(beatmapset.deletedAt),
		))
		.leftJoin(r.setStatus, eq(r.setStatus.setId, beatmapset.id));

	const tallies = await db
		.select({
			setId: r.requestVotes.setId, support: count(),
		})
		.from(r.requestVotes)
		.groupBy(r.requestVotes.setId);
	const support = new Map(tallies.map(t => [t.setId, t.support]));

	const mine = viewerId === undefined ? [] : await db
		.select({ setId: r.requestVotes.setId })
		.from(r.requestVotes)
		.where(eq(r.requestVotes.userId, viewerId));
	const supported = new Set(mine.map(v => v.setId));

	return rows.map(row => ({
		...row,
		// a planned rank's date is secret until it goes live
		rankedAt: row.rankedAt && row.rankedAt.getTime() <= Date.now() ? row.rankedAt : undefined,
		username: row.username ?? 'unknown',
		support: support.get(row.setId) ?? 0,
		supported: supported.has(row.setId),
	}));
};

/** Mark every open request for a set as accepted - called the moment its `.osz`
 *  lands, whether it came from the mirror or an admin upload. */
export const acceptRequestsForSet = async (setId: number, adminId?: number): Promise<void> => {
	// the set lands in every ruleset's queue, so each ruleset's request is answered
	for (const { requests } of queuedRulesets()) {
		await db
			.update(requests)
			.set({
				status: 'accepted', resolvedAt: new Date(), resolvedBy: adminId,
			})
			.where(and(eq(requests.setId, setId), eq(requests.status, 'pending')));
	}
};

/** A nominator's own upload of a map nobody asked for: they're its proposer. */
export const proposeUploadedSet = async (
	r: ServerRuleset,
	setId: number,
	osuSetId: number,
	userId: number,
) => {
	const [set] = await db.select({
		artist: beatmapset.artist, title: beatmapset.title, creator: beatmapset.creator,
	}).from(beatmapset).where(eq(beatmapset.id, setId)).limit(1);
	if (!set) return;
	await db.insert(r.requests).ignore().values({
		setId: osuSetId, userId, ...set,
		status: 'accepted', resolvedAt: new Date(), resolvedBy: userId,
	});
	await db.insert(r.requestVotes).ignore().values({
		setId: osuSetId, userId,
	});
};

/**
 * Player-facing ranking propositions. Reads are public (the queue is part of the
 * site); submitting and backing need an account; resolving and ingesting are
 * admin-only and feed straight into the nomination queue.
 */
export const beatmapRequestRoutes = new Hono()
	.get('/', rulesetParam, async c => c.json(
		await listRequests(await requestRuleset(c), await sessionUserId(c)),
	))

	// Autocomplete over the ranked/loved mirror.
	.get('/search', valid('query', z.object({
		q: z.string().optional(), ruleset: rulesetId.optional(),
	})), async c => {
		const q = c.req.query('q') ?? '';
		if (q.trim().length < 2) return c.json([] as Awaited<ReturnType<typeof searchManiaSets>>);
		return c.json(await searchManiaSets(await requestRuleset(c), q));
	})

	.post('/', rulesetParam, requireActive, valid('json', beatmapRequestBody), async c => {
		const r = await requestRuleset(c);
		const userId = c.get('userId');
		const setId = parseBeatmapsetId(c.req.valid('json').map);
		if (!setId || setId === INTRO_SET_ID) {
			throw new HTTPException(400, { message: 'That is not a beatmapset link' });
		}

		const [existing] = await db
			.select({ status: r.requests.status })
			.from(r.requests)
			.where(eq(r.requests.setId, setId))
			.limit(1);
		if (existing) {
			throw new HTTPException(409, {
				message: existing.status === 'pending'
					? 'That map is already in the queue - back it instead'
					: 'That map has already been through the queue',
			});
		}

		const [ingested] = await db
			.select({ status: r.setStatus.status })
			.from(beatmapset)
			.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmapset.id))
			.where(and(eq(beatmapset.osuId, setId), isNull(beatmapset.deletedAt)))
			.limit(1);
		if (ingested) {
			throw new HTTPException(409, {
				message: ingested.status === 'ranked' || ingested.status === 'loved'
					? `That map is already ${ingested.status} in oss!idle`
					: 'That map is already in the nomination queue',
			});
		}

		const [open] = await db
			.select({ pending: count() })
			.from(r.requests)
			.where(and(eq(r.requests.userId, userId), eq(r.requests.status, 'pending')));
		const max = maxPendingRequests(await isSupporter(userId));
		if (open.pending >= max) {
			throw new HTTPException(429, { message: `You already have ${max} requests waiting - wait for one to be resolved` });
		}

		const set = await resolveSet(r, setId);
		await db.insert(r.requests).values({
			setId,
			userId,
			artist: set.artist,
			title: set.title,
			creator: set.creator,
		});
		// The requester backs their own map, so the count reads as people wanting it.
		await db.insert(r.requestVotes).values({
			setId, userId,
		});

		return c.json({
			setId, ok: true,
		}, 201);
	})

	// Back a request (or take the backing away). Only while it's still open.
	.post('/:setId/support', rulesetParam, requireActive, async c => {
		const r = await requestRuleset(c);
		const setId = idParam.parse(c.req.param('setId'));
		const userId = c.get('userId');

		const [request] = await db
			.select({ status: r.requests.status })
			.from(r.requests)
			.where(eq(r.requests.setId, setId))
			.limit(1);
		if (!request) throw new HTTPException(404, { message: 'No such request' });
		if (request.status !== 'pending') {
			throw new HTTPException(409, { message: 'That request is already resolved' });
		}

		const [deleted] = await db
			.delete(r.requestVotes)
			.where(and(eq(r.requestVotes.setId, setId), eq(r.requestVotes.userId, userId)));

		if (!deleted.affectedRows) {
			await db.insert(r.requestVotes).values({
				setId, userId,
			});
		}
		return c.json({ supported: !deleted.affectedRows });
	})

	// Nominators: accept or reject, with a reason players can read.
	.patch('/:setId', rulesetParam, requireNominator, valid('json', beatmapRequestPatch), async c => {
		const r = await requestRuleset(c);
		const setId = idParam.parse(c.req.param('setId'));
		const body = c.req.valid('json');

		const [res] = await db
			.update(r.requests)
			.set({
				status: body.status,
				note: body.note ?? null,
				resolvedAt: body.status === 'pending' ? null : new Date(),
				resolvedBy: body.status === 'pending' ? null : c.get('userId'),
			})
			.where(eq(r.requests.setId, setId));
		if (!res.affectedRows) throw new HTTPException(404, { message: 'No such request' });

		return c.json({ ok: true });
	})

	// Nominators: pull the .osz from the mirror and run it through the normal ingest,
	// so an accepted request lands in the nomination queue in one click.
	.post('/:setId/ingest', rulesetParam, requireNominator, async c => {
		const r = await requestRuleset(c);
		const setId = idParam.parse(c.req.param('setId'));

		const [request] = await db
			.select({ setId: r.requests.setId })
			.from(r.requests)
			.where(eq(r.requests.setId, setId))
			.limit(1);
		if (!request) throw new HTTPException(404, { message: 'No such request' });

		try {
			const result = await ingestOsz(await downloadOsz(setId));
			await acceptRequestsForSet(setId, c.get('userId'));
			return c.json(result);
		} catch (e) {
			throw new HTTPException(400, { message: e instanceof Error ? e.message : 'Could not ingest that beatmap' });
		}
	})

	// The requester can withdraw an open request; a nominator can drop any of them.
	.delete('/:setId', rulesetParam, requireAuth, async c => {
		const r = await requestRuleset(c);
		const setId = idParam.parse(c.req.param('setId'));
		const userId = c.get('userId');

		const [request] = await db
			.select({
				userId: r.requests.userId, status: r.requests.status,
			})
			.from(r.requests)
			.where(eq(r.requests.setId, setId))
			.limit(1);
		if (!request) throw new HTTPException(404, { message: 'No such request' });

		const own = request.userId === userId && request.status === 'pending';
		if (!own && !await mayNominateIn(userId, r.def.id)) throw new HTTPException(403, { message: 'Forbidden' });

		await db.delete(r.requestVotes).where(eq(r.requestVotes.setId, setId));
		await db.delete(r.requests).where(eq(r.requests.setId, setId));
		return c.json({ ok: true });
	})
;

/** Who asked for each of these osu! sets, for the nomination queue's own listing. */
export const requestersForSets = async (r: ServerRuleset, setIds: number[]) => {
	if (!setIds.length) return new Map<number, { userId: number; username: string }>();
	const rows = await db
		.select({
			setId: r.requests.setId,
			userId: r.requests.userId,
			username: users.username,
		})
		.from(r.requests)
		.leftJoin(users, eq(users.id, r.requests.userId))
		.where(inArray(r.requests.setId, setIds));

	return new Map(rows.map(row => [row.setId, {
		userId: row.userId, username: row.username ?? 'unknown',
	}]));
};

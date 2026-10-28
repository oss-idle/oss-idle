import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	isNotNull,
	isNull,
	max,
	ne,
	sum,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	BEATMAP_STATUS,
	type BeatmapStatus,
	INTRO_SET_ID,
	isApproved,
	MAP_TAGS,
	parseMapTags,
} from '@oss-idle/shared/beatmap';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import {
	rateKey,
	rateSchema,
} from '@oss-idle/shared/rate';
import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';

import { requireAdmin } from '../auth/admin';
import {
	deferCatalogInvalidate,
	diffsOf,
	getCatalog,
	invalidateCatalog,
	isSetLive,
	isSetPublic,
	LIST_STATUSES,
	listCondition,
	listedAt,
	liveDiffCondition,
	nameMatches,
	panelColumns,
	setColumns,
	setLiveChanged,
	shownDiffCondition,
	shownStatusColumns,
	unrankedSet,
	unrankedSets,
	withStatus,
} from '../beatmaps/catalog';
import { fullSpeed } from '../beatmaps/fastDownloads';
import { ingestOsz } from '../beatmaps/ingest';
import {
	checkPreviewName,
	oszResponse,
	previewResponse,
} from '../beatmaps/serve';
import {
	statusIn,
	writeStatus,
} from '../beatmaps/setStatus';
import { deleteSetFiles } from '../beatmaps/storage';
import { clearForStatus } from '../beatmaps/upload';
import { db } from '../db/client';
import {
	beatmapListColumns,
	beatmaps,
} from '../db/schema/beatmap';
import type { SetStatusRow } from '../db/schema/beatmapset';
import {
	beatmapset,
	type BeatmapsetRow,
	getBeatmapsetById,
} from '../db/schema/beatmapset';
import { users } from '../db/schema/user';
import { env } from '../env';
import { playable } from '../rulesets/enabled';
import {
	enabledRulesets,
	rulesetOfBeatmap,
} from '../rulesets/registry';
import {
	rulesetParam,
	rulesetQuery,
} from '../rulesets/request';
import type { ServerRuleset } from '../rulesets/ruleset';
import { purgeBeatmapScores } from '../scores';
import {
	idParam,
	valid,
} from '../validate';
import { beatmapClaimRoutes } from './beatmapClaim';
import {
	acceptRequestsForSet,
	beatmapRequestRoutes,
	requestersForSets,
} from './beatmapRequest';
import { beatmapUploadRoutes } from './beatmapUpload';
import { levelVoteRoutes } from './levelVotes';


/** The listing's filters: which maps, a name to look for - and an optional page;
 *  with no page the whole list is returned (the search page filters it client-side). */
const listQuery = z.object({
	ruleset: z.enum(RULESET_IDS).optional(),
	status: z.enum(LIST_STATUSES).default('ranked'),
	q: z.string().optional(),
	page: z.coerce.number().int().positive().catch(1).optional(),
});


/** A set's live difficulties in one ruleset, easiest first, each with the set's row there. */
const setDiffs = (r: ServerRuleset, id: number) => db
	.select({
		set: {
			...setColumns(r), ...shownStatusColumns(r),
		},
		beatmap: beatmapListColumns,
	})
	.from(beatmaps)
	.innerJoin(beatmapset, eq(beatmaps.setId, beatmapset.id))
	.innerJoin(...withStatus(r))
	.where(and(eq(beatmapset.id, id), shownDiffCondition(r)))
	.orderBy(asc(beatmaps.sr));

const nominationPatch = z.object({
	rankedAt: z.string().datetime().nullable().optional(),
	status: z.enum(BEATMAP_STATUS).optional(),
	bundled: z.boolean().optional(),
	categorized: z.boolean().optional(),
	/** why a player's submission goes back to them (status 'unranked') */
	note: z.string().max(2000).optional(),
});

type NominationPatch = z.infer<typeof nominationPatch>;

/** What a queue edit writes on the set. Only a player's own upload goes back to being
 *  theirs ('unranked'), with the reason why; (re)ranking or loving re-arms the announce.
 *  A loved set is never bundled. */
const nominationUpdates = (existing: BeatmapsetRow, was: BeatmapStatus, body: NominationPatch) => {
	const player = existing.uploadedAt !== null;
	if (body.status === 'unranked' && !player) {
		throw new HTTPException(400, { message: 'Only a player\'s own map can be sent back' });
	}
	const set: Partial<typeof beatmapset.$inferInsert> = {};
	const status: Partial<SetStatusRow> = {};
	if (body.rankedAt !== undefined) status.rankedAt = body.rankedAt ? new Date(body.rankedAt) : null;
	if (body.bundled !== undefined) set.bundled = body.bundled;
	if (body.categorized !== undefined) set.categorized = body.categorized;
	if ((body.status ?? was) === 'loved') set.bundled = false;
	if (body.status !== undefined) {
		status.status = body.status;
		if (isApproved(body.status)) status.announced = false;
		if (body.status === 'unranked') status.reviewNote = body.note?.trim() || null;
	}
	return {
		set, status,
	};
};

export const beatmapsRoutes = new Hono()
	// Public, live-only (approved, AND rankedAt <= now()).
	.get('/catalog', async c => c.json(await getCatalog()))

	// Every difficulty's stars at a rate, by id: song select's cards and sort follow it.
	.get('/stars/:rate', async c => {
		const rate = rateSchema.safeParse(Number(c.req.param('rate')));
		if (!rate.success) throw new HTTPException(400, { message: 'Unknown rate' });
		const key = rateKey(rate.data);
		const rows = (await Promise.all(enabledRulesets().map(r => db.select({
			id: beatmaps.id, rateStars: beatmaps.rateStars,
		})
			.from(beatmaps)
			.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmaps.setId))
			.where(and(liveDiffCondition(r), isNotNull(beatmaps.rateStars)))))).flat();
		// MariaDB keeps json as text: it comes back unparsed
		const starsOf = (raw: unknown) =>
			(typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, number>;
		const stars: Record<number, number> = {};
		for (const row of rows) {
			const at = starsOf(row.rateStars)[key];
			if (at !== undefined) stars[row.id] = at;
		}
		return c.json(stars);
	})

	.get('/all/:dir', valid('query', listQuery), async c => {
		const sort = c.req.param('dir') === 'asc' ? asc : desc;
		const { status, q, page } = c.req.valid('query');
		const r = rulesetQuery(c);
		const rows = db
			.select({
				...setColumns(r),
				...panelColumns(),
			})
			.from(beatmapset)
			.innerJoin(...withStatus(r))
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(and(listCondition(r, status), nameMatches(q)))
			.groupBy(beatmapset.id)
			.orderBy(sort(listedAt(r)));
		return c.json(await (page
			? rows.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)
			: rows));
	})
	.get('/recent', async c => {
		const r = rulesetQuery(c);
		return c.json(await db
			.select({
				...setColumns(r),
				background: max(beatmaps.background),
			})
			.from(beatmapset)
			.innerJoin(...withStatus(r))
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(listCondition(r, 'ranked'))
			.groupBy(beatmapset.id)
			.orderBy(desc(r.setStatus.rankedAt))
			.limit(10),
		);
	})
	.get('/popular/:dir', valid('query', listQuery), async c => {
		const sort = c.req.param('dir') === 'asc' ? asc : desc;
		const { status, q, page } = c.req.valid('query');
		const plays = sum(beatmaps.plays).as('plays');
		const r = rulesetQuery(c);
		const rows = db
			.select({
				...setColumns(r),
				...panelColumns(),
				plays,
			})
			.from(beatmapset)
			.innerJoin(...withStatus(r))
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(and(listCondition(r, status), nameMatches(q)))
			.groupBy(beatmapset.id)
			.orderBy(sort(plays));
		return c.json(await (page
			? rows.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)
			: rows));
	})

	// Players' unranked uploads, catalog-shaped for oss!direct.
	.get('/unranked', async c => c.json(await unrankedSets()))

	// A player's unranked upload, catalog-shaped for the game to download it.
	.get('/unranked/:setId', async c => {
		const set = await unrankedSet(idParam.parse(c.req.param('setId')));
		if (!set) throw new HTTPException(404, { message: 'Beatmap not available' });
		return c.json(set);
	})

	// A live set's .osz (404 until it's ranked + due), or a player's unranked upload.
	// The client fetches this URL directly, not via the typed RPC.
	// `?bulk` (download every ranked map) is rate-capped, a double-click isn't;
	// a non-supporter's sets past the day's full-speed ones go slower still.
	.get('/osz/:setId', async c => {
		const id = idParam.parse(c.req.param('setId'));
		if (!await isSetPublic(id)) throw new HTTPException(404, { message: 'Beatmap not available' });
		if (!await fullSpeed(c, id)) {
			return oszResponse(id, env.SLOW_DOWNLOAD_RATE, { 'X-Download-Rate': 'reduced' });
		}
		return oszResponse(id, c.req.query('bulk') !== undefined ? env.BULK_DOWNLOAD_RATE : undefined);
	})

	// A downloadable set's preview audio/background. File names are set-id prefixed.
	.get('/preview/:setId/:file', async c => {
		const id = idParam.parse(c.req.param('setId'));
		const file = c.req.param('file');
		checkPreviewName(id, file);
		if (!await isSetPublic(id)) throw new HTTPException(404, { message: 'Beatmap not available' });
		return previewResponse(file);
	})

	// --- Beatmap nomination (admin): manage the queue + ranked dates. ---
	.get('/nomination', requireAdmin, async c => {
		const r = rulesetQuery(c);
		const sets = await db
			.select({
				...setColumns(r),
				plays: sum(beatmaps.plays),
				background: max(beatmaps.background),
				audio: max(beatmaps.audio),
				// who submitted a player's own map
				submittedBy: max(users.username),
			})
			.from(beatmapset)
			.innerJoin(...withStatus(r))
			.innerJoin(beatmaps, and(
				eq(beatmapset.id, beatmaps.setId), diffsOf(r),
			))
			.leftJoin(users, and(eq(users.id, beatmapset.ownerUserId), isNotNull(beatmapset.uploadedAt)))
			// players' own uploads only reach the queue once submitted for rank
			.where(and(
				isNull(beatmapset.deletedAt), ne(r.setStatus.status, 'unranked'), ne(beatmapset.id, INTRO_SET_ID),
			))
			.groupBy(beatmapset.id)
			.orderBy(desc(beatmapset.id));

		const diffs = await db
			.select({
				id: beatmaps.id,
				setId: beatmaps.setId,
				version: beatmaps.version,
				sr: beatmaps.sr,
				mode: beatmaps.mode,
				keys: beatmaps.keys,
				plays: beatmaps.plays,
				ranked: beatmaps.ranked,
				tags: beatmaps.tags,
				ln: beatmaps.ln,
				objects: beatmaps.objects,
				bpmPoints: beatmaps.bpmPoints,
				svPoints: beatmaps.svPoints,
			})
			.from(beatmaps)
			.where(diffsOf(r));

		const bySet = new Map<number, typeof diffs>();
		for (const diff of diffs) {
			const list = bySet.get(diff.setId);
			if (list) list.push(diff);
			else bySet.set(diff.setId, [diff]);
		}

		const requesters = await requestersForSets(r, sets.flatMap(set => set.osuId ?? []));

		return c.json(sets.map(set => ({
			...set,
			diffs: (bySet.get(set.id) ?? [])
				.map(diff => ({
					...diff, tags: parseMapTags(diff.tags),
				}))
				.sort((a, b) => Number(a.sr) - Number(b.sr)),
			// Set when the map got here through a player's request.
			requestedBy: set.osuId ? requesters.get(set.osuId) : undefined,
		})));
	})
	.post('/nomination', requireAdmin, async c => {
		const body = await c.req.parseBody();
		const file = body['file'];
		if (!(file instanceof File)) throw new HTTPException(400, { message: 'No .osz file provided' });

		const buffer = Buffer.from(await file.arrayBuffer());
		try {
			const result = await ingestOsz(buffer);
			// A map someone asked for is answered the moment its file lands.
			if (result.osuSetId) await acceptRequestsForSet(result.osuSetId, c.get('userId'));
			return c.json(result);
		} catch (e) {
			throw new HTTPException(400, { message: e instanceof Error ? e.message : 'Could not ingest beatmap' });
		}
	})
	// The intro is ranked at ingest so it's served; unranking or deleting it breaks startup.
	.use('/nomination/:setId/*', async (c, next) => {
		if (Number(c.req.param('setId')) === INTRO_SET_ID) {
			throw new HTTPException(400, { message: 'The intro set can\'t be edited' });
		}
		await next();
	})
	// The preview route only serves public sets; the queue hears them before they are.
	.get('/nomination/:setId/preview/:file', requireAdmin, async c => {
		const id = idParam.parse(c.req.param('setId'));
		const file = c.req.param('file');
		checkPreviewName(id, file);
		return previewResponse(file);
	})
	// A queued set's .osz, public or not, to try it before ranking it.
	.get('/nomination/:setId/osz', requireAdmin, async c => {
		const res = await oszResponse(idParam.parse(c.req.param('setId')));
		res.headers.set('Cache-Control', 'no-store');
		return res;
	})
	.patch('/nomination/:setId', requireAdmin, valid('json', nominationPatch), async c => {
		const id = idParam.parse(c.req.param('setId'));
		const body = c.req.valid('json');

		const r = rulesetQuery(c);
		const existing = await getBeatmapsetById(id);
		if (!existing) throw new HTTPException(404, { message: 'Beatmap set not found' });
		const was = (await statusIn(r, id))?.status ?? 'pending';
		const wasLive = await isSetLive(id);

		const updates = nominationUpdates(existing, was, body);
		if (Object.keys(updates.set).length) {
			await db.update(beatmapset).set(updates.set).where(eq(beatmapset.id, id));
		}
		if (Object.keys(updates.status).length) await writeStatus(r, id, updates.status);
		if (body.status !== undefined) await clearForStatus(r, id, was, body.status);

		await setLiveChanged(wasLive, await isSetLive(id));
		return c.json({ ok: true });
	})
	// Toggle one difficulty in/out of the ranked set. Works before the set is
	// live (choose which diffs go ranked) and after (unrank a single diff).
	.patch('/nomination/:setId/beatmap/:beatmapId', requireAdmin,
		valid('json', z.object({ ranked: z.boolean() })), async c => {
			const setId = idParam.parse(c.req.param('setId'));
			const beatmapId = idParam.parse(c.req.param('beatmapId'));
			const { ranked } = c.req.valid('json');

			// An unplayable diff can never be ranked.
			if (ranked) {
				const [diff] = await db
					.select({
						mode: beatmaps.mode, keys: beatmaps.keys, 
					})
					.from(beatmaps)
					.where(and(eq(beatmaps.id, beatmapId), eq(beatmaps.setId, setId)))
					.limit(1);
				if (!diff) throw new HTTPException(404, { message: 'Beatmap not found' });
				if (!playable(diff.mode, diff.keys)) {
					throw new HTTPException(400, { message: 'Only a difficulty some ruleset here plays can be ranked' });
				}
			}

			const [res] = await db
				.update(beatmaps)
				.set({ ranked })
				.where(and(eq(beatmaps.id, beatmapId), eq(beatmaps.setId, setId)));
			if (!res.affectedRows) throw new HTTPException(404, { message: 'Beatmap not found' });

			// Unranking a difficulty wipes all progression earned on it.
			if (!ranked) await purgeBeatmapScores(beatmapId);
			if (await isSetLive(setId)) await (ranked ? invalidateCatalog() : deferCatalogInvalidate());
			return c.json({ ok: true });
		})
	.put('/nomination/:setId/beatmap/:beatmapId/tags', requireAdmin,
		valid('json', z.object({ tags: z.array(z.enum(MAP_TAGS)) })), async c => {
			const setId = idParam.parse(c.req.param('setId'));
			const beatmapId = idParam.parse(c.req.param('beatmapId'));
			const { tags } = c.req.valid('json');
			const [res] = await db
				.update(beatmaps)
				.set({ tags: [...new Set(tags)].join(',') })
				.where(and(eq(beatmaps.id, beatmapId), eq(beatmaps.setId, setId)));
			if (!res.affectedRows) throw new HTTPException(404, { message: 'Beatmap not found' });
			if (await isSetLive(setId)) await deferCatalogInvalidate();
			return c.json({ ok: true });
		})
	.delete('/nomination/:setId', requireAdmin, async c => {
		const id = idParam.parse(c.req.param('setId'));
		const wasLive = await isSetLive(id);

		// Scores have no FK on beatmapId: purge progression first.
		const diffs = await db
			.select({ id: beatmaps.id })
			.from(beatmaps)
			.where(eq(beatmaps.setId, id));
		for (const diff of diffs) await purgeBeatmapScores(diff.id);

		// The rows stay, so the ids are never reused and a re-upload gets them back.
		const [res] = await db.update(beatmapset).set({ deletedAt: new Date() })
			.where(eq(beatmapset.id, id));
		for (const r of enabledRulesets()) {
			await writeStatus(r, id, {
				status: 'pending', rankedAt: null, announced: false,
			});
		}

		await deleteSetFiles(id);

		if (!res.affectedRows) throw new HTTPException(404, { message: 'Beatmap set not found' });
		if (wasLive) await deferCatalogInvalidate();
		return c.json({ ok: true });
	})

	// Player-facing ranking propositions. Mounted before the `:id` catch-all so
	// `/request` isn't swallowed by it.
	.route('/request', beatmapRequestRoutes)
	.route('/upload', beatmapUploadRoutes)
	.route('/claim', beatmapClaimRoutes)
	.route('/levels', levelVoteRoutes)

	// A set's page, osu!'s way: every ruleset it has live difficulties in (its tabs, each
	// with its count and status), and the set and those difficulties, easiest first, in the
	// one asked for - else the first it has.
	.get('/set/:id', rulesetParam, async c => {
		const id = idParam.parse(c.req.param('id'));
		const listed = (await Promise.all(enabledRulesets().map(async r => ({
			r, rows: await setDiffs(r, id),
		})))).filter(({ rows }) => rows.length);
		if (!listed.length) throw new HTTPException(404, { message: 'Beatmap set not found' });
		const asked = c.req.valid('query').ruleset;
		const { r, rows } = listed.find(l => l.r.def.id === asked) ?? listed[0];
		return c.json({
			ruleset: r.def.id,
			rulesets: listed.map(l => ({
				ruleset: l.r.def.id, diffs: l.rows.length, status: l.rows[0].set.status,
			})),
			set: rows[0].set,
			diffs: rows.map(row => ({
				...row.beatmap, sr: Number(row.beatmap.sr),
			})),
		});
	})

	// A downloadable difficulty's checksum: the game's copy is outdated when its own differs.
	.get('/checksum/:id', async c => {
		// the file is the set's, whichever ruleset lists it (the intro is no ruleset's)
		const [row] = await db
			.select({
				checksum: beatmaps.checksum, setId: beatmaps.setId,
			})
			.from(beatmaps)
			.where(eq(beatmaps.id, idParam.parse(c.req.param('id'))))
			.limit(1);
		if (!row || !await isSetPublic(row.setId)) {
			throw new HTTPException(404, { message: 'Beatmap not found' });
		}
		return c.json({ checksum: row.checksum });
	})

	// Single beatmap (difficulty), live-only. Keep last: catch-all `:id`.
	.get('/:id', async c => {
		const id = idParam.parse(c.req.param('id'));
		const r = await rulesetOfBeatmap(id);

		const [row] = r ? await db
			.select(getTableColumns(beatmaps))
			.from(beatmaps)
			.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmaps.setId))
			.where(and(eq(beatmaps.id, id), liveDiffCondition(r)))
			.limit(1) : [];

		if (!row) throw new HTTPException(404, { message: 'Beatmap not found' });

		return c.json(row);
	})
;

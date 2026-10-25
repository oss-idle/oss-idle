import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	isNull,
	max,
	sum,
	isNotNull,
	ne,
	or,
} from 'drizzle-orm';
import { z } from 'zod';
import {
	rateKey,
	rateSchema,
} from '@oss-idle/shared/rate';
import {
	BEATMAP_STATUS,
	INTRO_SET_ID,
	MAP_TAGS,
	parseMapTags,
} from '@oss-idle/shared/beatmap';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import {
	checkPreviewName,
	oszResponse,
	previewResponse,
} from '../beatmaps/serve';
import { beatmapClaimRoutes } from './beatmapClaim';
import { db } from '../db/client';
import {
	beatmapListColumns,
	beatmaps,
} from '../db/schema/beatmap';
import {
	beatmapset,
	getBeatmapsetById,
	type BeatmapsetRow,
} from '../db/schema/beatmapset';
import { requireAdmin } from '../auth/admin';
import { ingestOsz } from '../beatmaps/ingest';
import { purgeBeatmapScores } from '../scores';
import {
	LIST_STATUSES,
	deferCatalogInvalidate,
	getCatalog,
	invalidateCatalog,
	isSetLive,
	isSetPublic,
	listCondition,
	setLiveChanged,
	listedAt,
	listedCondition,
	liveDiffCondition,
	nameMatches,
	panelColumns,
	playerMapCondition,
	unrankedSet,
	unrankedSets,
} from '../beatmaps/catalog';
import { deleteSetFiles } from '../beatmaps/storage';
import { clearForStatus } from '../beatmaps/upload';
import { beatmapUploadRoutes } from './beatmapUpload';
import { users } from '../db/schema/user';
import {
	acceptRequestsForSet,
	beatmapRequestRoutes,
	requestersForSets,
} from './beatmapRequest';
import {
	idParam,
	valid,
} from '../validate';


/** The listing's filters: which maps, a name to look for - and an optional page;
 *  with no page the whole list is returned (the search page filters it client-side). */
const listQuery = z.object({
	status: z.enum(LIST_STATUSES).default('ranked'),
	q: z.string().optional(),
	page: z.coerce.number().int().positive().catch(1).optional(),
});


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
 *  theirs ('unranked'), with the reason why; (re)ranking re-arms the announce. */
const nominationUpdates = (existing: BeatmapsetRow, body: NominationPatch) => {
	const player = existing.uploadedAt !== null;
	if (body.status === 'unranked' && !player) {
		throw new HTTPException(400, { message: 'Only a player\'s own map can be sent back' });
	}
	const updates: Partial<typeof beatmapset.$inferInsert> = {};
	if (body.rankedAt !== undefined) updates.rankedAt = body.rankedAt ? new Date(body.rankedAt) : null;
	if (body.bundled !== undefined) updates.bundled = body.bundled;
	if (body.categorized !== undefined) updates.categorized = body.categorized;
	if (body.status === undefined) return updates;
	updates.status = body.status;
	if (body.status === 'ranked') updates.announced = false;
	if (body.status === 'unranked') updates.reviewNote = body.note?.trim() || null;
	return updates;
};

export const beatmapsRoutes = new Hono()
	// Public, live-only (status='ranked' AND rankedAt <= now()).
	.get('/catalog', async c => c.json(await getCatalog()))

	// Every difficulty's stars at a rate, by id: song select's cards and sort follow it.
	.get('/stars/:rate', async c => {
		const rate = rateSchema.safeParse(Number(c.req.param('rate')));
		if (!rate.success) throw new HTTPException(400, { message: 'Unknown rate' });
		const key = rateKey(rate.data);
		const rows = await db.select({
			id: beatmaps.id, rateStars: beatmaps.rateStars,
		})
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.where(and(liveDiffCondition, isNotNull(beatmaps.rateStars)));
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
		const rows = db
			.select({
				...getTableColumns(beatmapset),
				...panelColumns(),
			})
			.from(beatmapset)
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(and(listCondition(status), nameMatches(q)))
			.groupBy(beatmapset.id)
			.orderBy(sort(listedAt));
		return c.json(await (page
			? rows.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)
			: rows));
	})
	.get('/recent', async c => {
		return c.json(await db
			.select({
				...getTableColumns(beatmapset),
				background: max(beatmaps.background),
			})
			.from(beatmapset)
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(listedCondition)
			.groupBy(beatmapset.id)
			.orderBy(desc(beatmapset.rankedAt))
			.limit(10),
		);
	})
	.get('/popular/:dir', valid('query', listQuery), async c => {
		const sort = c.req.param('dir') === 'asc' ? asc : desc;
		const { status, q, page } = c.req.valid('query');
		const plays = sum(beatmaps.plays).as('plays');
		const rows = db
			.select({
				...getTableColumns(beatmapset),
				...panelColumns(),
				plays,
			})
			.from(beatmapset)
			.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.where(and(listCondition(status), nameMatches(q)))
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
	// `?bulk` (download every ranked map) is rate-capped, a double-click isn't.
	.get('/osz/:setId', async c => {
		const id = idParam.parse(c.req.param('setId'));
		if (!await isSetPublic(id)) throw new HTTPException(404, { message: 'Beatmap not available' });
		return oszResponse(id, c.req.query('bulk') !== undefined);
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
		const sets = await db
			.select({
				...getTableColumns(beatmapset),
				plays: sum(beatmaps.plays),
				background: max(beatmaps.background),
				audio: max(beatmaps.audio),
				// who submitted a player's own map
				submittedBy: max(users.username),
			})
			.from(beatmapset)
			.leftJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
			.leftJoin(users, and(eq(users.id, beatmapset.ownerUserId), isNotNull(beatmapset.uploadedAt)))
			// players' own uploads only reach the queue once submitted for rank
			.where(and(
				isNull(beatmapset.deletedAt), ne(beatmapset.status, 'unranked'), ne(beatmapset.id, INTRO_SET_ID),
			))
			.groupBy(beatmapset.id)
			.orderBy(desc(beatmapset.id));

		const diffs = await db
			.select({
				id: beatmaps.id,
				setId: beatmaps.setId,
				version: beatmaps.version,
				sr: beatmaps.sr,
				keys: beatmaps.keys,
				plays: beatmaps.plays,
				ranked: beatmaps.ranked,
				tags: beatmaps.tags,
				ln: beatmaps.ln,
				objects: beatmaps.objects,
				bpmPoints: beatmaps.bpmPoints,
				svPoints: beatmaps.svPoints,
			})
			.from(beatmaps);

		const bySet = new Map<number, typeof diffs>();
		for (const diff of diffs) {
			const list = bySet.get(diff.setId);
			if (list) list.push(diff);
			else bySet.set(diff.setId, [diff]);
		}

		const requesters = await requestersForSets(sets.flatMap(set => set.osuId ?? []));

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
		const res = await oszResponse(idParam.parse(c.req.param('setId')), false);
		res.headers.set('Cache-Control', 'no-store');
		return res;
	})
	.patch('/nomination/:setId', requireAdmin, valid('json', nominationPatch), async c => {
		const id = idParam.parse(c.req.param('setId'));
		const body = c.req.valid('json');

		const existing = await getBeatmapsetById(id);
		if (!existing) throw new HTTPException(404, { message: 'Beatmap set not found' });
		const wasLive = await isSetLive(id);

		await db.update(beatmapset).set(nominationUpdates(existing, body)).where(eq(beatmapset.id, id));
		if (body.status !== undefined) await clearForStatus(existing, body.status);

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

			// Only 4K is playable; non-4K diffs can never be ranked.
			if (ranked) {
				const [diff] = await db
					.select({ keys: beatmaps.keys })
					.from(beatmaps)
					.where(and(eq(beatmaps.id, beatmapId), eq(beatmaps.setId, setId)))
					.limit(1);
				if (!diff) throw new HTTPException(404, { message: 'Beatmap not found' });
				if (diff.keys !== 4) {
					throw new HTTPException(400, { message: 'Only 4K difficulties can be ranked' });
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
		const [res] = await db.update(beatmapset).set({
			deletedAt: new Date(), status: 'pending', rankedAt: null, announced: false,
		}).where(eq(beatmapset.id, id));

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

	// A set's page: the set and its live difficulties, easiest first.
	.get('/set/:id', async c => {
		const id = idParam.parse(c.req.param('id'));
		const rows = await db
			.select({
				set: beatmapset, beatmap: beatmapListColumns,
			})
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmaps.setId, beatmapset.id))
			.where(and(eq(beatmapset.id, id), or(liveDiffCondition, playerMapCondition)))
			.orderBy(asc(beatmaps.sr));
		if (!rows.length) throw new HTTPException(404, { message: 'Beatmap set not found' });
		return c.json({
			set: rows[0].set,
			diffs: rows.map(r => ({
				...r.beatmap, sr: Number(r.beatmap.sr),
			})),
		});
	})

	// Single beatmap (difficulty), live-only. Keep last: catch-all `:id`.
	.get('/:id', async c => {
		const id = idParam.parse(c.req.param('id'));

		const [row] = await db
			.select(getTableColumns(beatmaps))
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmaps.setId, beatmapset.id))
			.where(and(eq(beatmaps.id, id), liveDiffCondition))
			.limit(1);

		if (!row) throw new HTTPException(404, { message: 'Beatmap not found' });

		return c.json(row);
	})
;

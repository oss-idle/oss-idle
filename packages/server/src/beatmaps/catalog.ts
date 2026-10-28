import { statSync } from 'node:fs';

import {
	and,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	like,
	lte,
	max,
	ne,
	or,
	type SQL,
	sql,
	sum,
} from 'drizzle-orm';

import {
	APPROVED_STATUSES,
	type BeatmapStatus,
	INTRO_SET_ID,
	isApproved,
	type MapTag,
	type PanelDiff,
	parseMapTags,
} from '@oss-idle/shared/beatmap';

import { db } from '../db/client';
import { likeEscape } from '../db/columns';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { redisKeyPrefix } from '../env';
import { redis } from '../redis';
import { hub } from '../ws/hub';
import { oszPath } from './storage';
export { setColumns } from '../db/schema/beatmapset';
import { chartsOf } from '../rulesets/enabled';
import { enabledRulesets } from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';

/** What a set's panel shows besides the set itself, over the `beatmaps` joined to it:
 *  plays, a cover, the preview track and the difficulties. */
export const panelColumns = () => ({
	plays: sum(beatmaps.plays),
	background: max(beatmaps.background),
	audio: max(beatmaps.audio),
	diffs: sql<PanelDiff[]>`json_arrayagg(json_object('id', ${beatmaps.id},
		'version', ${beatmaps.version}, 'sr', ${beatmaps.sr}, 'keys', ${beatmaps.keys}))`
		.mapWith(value => (typeof value === 'string' ? JSON.parse(value) : value) as PanelDiff[]),
});

/** The difficulties a ruleset plays, for a query joining `beatmaps`. */
export const diffsOf = (r: ServerRuleset) => chartsOf(r.def.id, beatmaps.mode, beatmaps.keys);

/** A set is live in a ruleset - listed, downloadable, previewable - only once it's ranked (or
 *  loved) there and its scheduled rank time has passed. Pending (null rankedAt) and future-dated
 *  sets are excluded (null <= now() is null, so they drop out). For queries joining the
 *  ruleset's `setStatus`, so the whole site shares one definition of "live". */
export const liveCondition = ({ setStatus }: ServerRuleset) => and(
	inArray(setStatus.status, [...APPROVED_STATUSES]),
	lte(setStatus.rankedAt, sql`now()`),
);

/** Per-difficulty gate on top of `liveCondition`: a diff is live only when its
 *  set is live in its ruleset AND the diff itself is ranked. For queries joining `beatmaps`. */
export const liveDiffCondition = (r: ServerRuleset) => and(
	liveCondition(r), eq(beatmaps.ranked, true), diffsOf(r),
);

// Public listings show live sets (ranked diffs only) but never the intro (it's
// not a ranked map). Every listing joins `beatmaps`, so the diff gate applies.
export const listedCondition = (r: ServerRuleset) =>
	and(liveDiffCondition(r), ne(beatmapset.id, INTRO_SET_ID));

const previewUrl = (setId: number, file: string | null) =>
	file ? `/v1/beatmap/preview/${setId}/${file}` : undefined;

/** A player's own upload that is still up and unranked in the ruleset: the one with a leaderboard. */
export const unrankedCondition = ({ setStatus }: ServerRuleset) => and(
	eq(setStatus.status, 'unranked'),
	isNull(beatmapset.deletedAt),
);

/** A player's own map that is still up and not ranked in the ruleset: unranked, or waiting in
 *  its ranking queue - listed, downloadable and with its page either way. */
export const playerMapCondition = ({ setStatus }: ServerRuleset) => and(
	isNull(beatmapset.deletedAt),
	isNotNull(beatmapset.uploadedAt),
	or(eq(setStatus.status, 'unranked'), eq(setStatus.status, 'pending')),
);

/** A player's own map ranked or loved for a time still to come: out of the game until then,
 *  but its page, its download and its mapper's profile show it as planned. */
export const plannedCondition = ({ setStatus }: ServerRuleset) => and(
	isNull(beatmapset.deletedAt),
	isNotNull(beatmapset.uploadedAt),
	inArray(setStatus.status, [...APPROVED_STATUSES]),
	or(isNull(setStatus.rankedAt), gt(setStatus.rankedAt, sql`now()`)),
);

/** A difficulty with a page: live, or on a player's map still up. For queries joining `beatmaps`. */
export const shownDiffCondition = (r: ServerRuleset) =>
	or(liveDiffCondition(r), and(or(playerMapCondition(r), plannedCondition(r)), diffsOf(r)));

/** A set's status and ranked date as the site shows them: 'planned', its date secret until it goes live. */
export const shownStatusColumns = (r: ServerRuleset) => ({
	status: sql<BeatmapStatus | 'planned'>`case when ${plannedCondition(r)} then 'planned' else ${r.setStatus.status} end`,
	rankedAt: sql<Date | null>`case when ${r.setStatus.rankedAt} <= now() then ${r.setStatus.rankedAt} end`
		.mapWith(r.setStatus.rankedAt),
});

/** The ruleset's status of every set, for a query on `beatmapset`. */
export const withStatus = ({ setStatus }: ServerRuleset) =>
	[setStatus, eq(setStatus.setId, beatmapset.id)] as const;

/** Whether a set matches `where` in any ruleset this server plays. */
const inAnyRuleset = async (setId: number, where: (r: ServerRuleset) => SQL | undefined) => {
	for (const r of enabledRulesets()) {
		const [row] = await db
			.select({ id: beatmapset.id })
			.from(beatmapset)
			.innerJoin(...withStatus(r))
			.where(and(eq(beatmapset.id, setId), where(r)))
			.limit(1);
		if (row) return true;
	}
	return false;
};

/** Whether a single set is live in any ruleset, for gating the .osz + preview file routes. */
export const isSetLive = (setId: number): Promise<boolean> => inAnyRuleset(setId, liveCondition);

/** Whether anyone may download a set: a live one, or a player's own not ranked yet. */
export const isSetPublic = (setId: number): Promise<boolean> =>
	inAnyRuleset(setId, r => or(liveCondition(r), playerMapCondition(r), plannedCondition(r)));

// `runtime: false` marks a catalog entry the client hasn't downloaded yet, as
// opposed to its local runtime store of downloaded sets.
type CatalogVersion = {
	id: number;
	// its .osu inside the .osz; older rows only have their id in the file
	file?: string;
	runtime: false;
	version: string;
	difficulty: number;
	mode: number;
	keys: number;
	audio?: string;
	background?: string;
	total_length: number;
	bpm: number;
	objects: number;
	rice: number;
	ln: number;
	tags: MapTag[];
};

type CatalogSet = {
	id: number;
	runtime: false;
	title: string;
	artist: string;
	creator: string;
	background?: string;
	audio?: string;
	/** the .osz's size in bytes */
	size: number;
	/** listed in song select before it is downloaded */
	bundled: boolean;
	/** false for a player's own map not ranked yet */
	ranked: boolean;
	/** live, but gives no pp */
	loved: boolean;
	/** when it was approved, or submitted for one not ranked */
	rankedAt: string;
	/** every difficulty's plays */
	plays: number;
	versions: CatalogVersion[];
};

export type Catalog = {
	intro?: CatalogSet;
	beatmaps: CatalogSet[];
};

/** Every set with a difficulty matching `where` in a ruleset, with those difficulties,
 *  catalog-shaped. */
const catalogSets = async (r: ServerRuleset, where: SQL | undefined): Promise<CatalogSet[]> => {
	const rows = await db
		.select({
			setId: beatmapset.id,
			artist: beatmapset.artist,
			title: beatmapset.title,
			creator: beatmapset.creator,
			bundled: beatmapset.bundled,
			status: r.setStatus.status,
			rankedAt: r.setStatus.rankedAt,
			submittedAt: r.setStatus.submittedAt,
			b: beatmaps,
		})
		.from(beatmapset)
		.innerJoin(...withStatus(r))
		.innerJoin(beatmaps, eq(beatmapset.id, beatmaps.setId))
		.where(where);

	const sets = new Map<number, CatalogSet>();
	for (const row of rows) {
		let set = sets.get(row.setId);
		if (!set) {
			set = {
				id: row.setId,
				runtime: false,
				title: row.title,
				artist: row.artist,
				creator: row.creator,
				bundled: row.bundled,
				ranked: isApproved(row.status),
				loved: row.status === 'loved',
				rankedAt: (row.rankedAt ?? row.submittedAt).toISOString(),
				plays: 0,
				size: statSync(oszPath(row.setId), { throwIfNoEntry: false })?.size ?? 0,
				versions: [],
			};
			sets.set(row.setId, set);
		}

		const audio = previewUrl(row.setId, row.b.audio);
		const background = previewUrl(row.setId, row.b.background);

		set.versions.push({
			id: row.b.id,
			file: row.b.file ?? undefined,
			runtime: false,
			version: row.b.version,
			difficulty: Math.round(Number(row.b.sr) * 100) / 100,
			mode: row.b.mode,
			keys: row.b.keys,
			audio,
			background,
			total_length: row.b.total_length,
			bpm: row.b.bpm,
			objects: row.b.objects,
			rice: row.b.rice,
			ln: row.b.ln,
			tags: parseMapTags(row.b.tags),
		});

		set.plays += row.b.plays;
		set.audio ??= audio;
		set.background ??= background;
	}

	return [...sets.values()];
};

/** Sets listed by several rulesets as one: every ruleset's difficulties, ranked or loved
 *  when any ruleset has it so. */
const mergeSets = (lists: CatalogSet[][]): CatalogSet[] => {
	const sets = new Map<number, CatalogSet>();
	for (const set of lists.flat()) {
		const held = sets.get(set.id);
		if (!held) sets.set(set.id, set);
		else {
			// the intro is every ruleset's, its difficulty with it
			held.versions.push(...set.versions.filter(v => !held.versions.some(h => h.id === v.id)));
			held.plays += set.plays;
			held.ranked ||= set.ranked;
			held.loved ||= set.loved;
		}
	}
	return [...sets.values()];
};

/** Every ruleset's catalog sets matching `where`, merged. */
const allCatalogSets = async (where: (r: ServerRuleset) => SQL | undefined) =>
	mergeSets(await Promise.all(enabledRulesets().map(r => catalogSets(r, where(r)))));

/** The live catalog: every ranked-and-due set with its difficulties, plus the
 *  intro set called out separately (a standard map: no ruleset lists its difficulty).
 *  Replaces the old static manifest.json. */
export const buildCatalog = async (): Promise<Catalog> => {
	const [sets, intros] = await Promise.all([
		allCatalogSets(liveDiffCondition),
		allCatalogSets(r => and(eq(beatmapset.id, INTRO_SET_ID), liveCondition(r))),
	]);
	return {
		intro: intros[0], beatmaps: mergeSets([sets, intros]),
	};
};

const VERSION_KEY = `${redisKeyPrefix}catalog:version`;
const PENDING_KEY = `${redisKeyPrefix}catalog:pending`;
const MAX_AGE = 60_000;
const BATCH = 5 * 60_000;

let cached: { version?: string, at: number, catalog: Promise<Catalog> } | undefined;

/** The catalog, built once per worker until invalidated (or a minute old, for plays). */
export const getCatalog = async (): Promise<Catalog> => {
	const version = await redis.get(VERSION_KEY) ?? undefined;
	if (!cached || cached.version !== version || Date.now() - cached.at > MAX_AGE) {
		const catalog = buildCatalog();
		cached = {
			version, at: Date.now(), catalog, 
		};
		catalog.catch(() => { if (cached?.catalog === catalog) cached = undefined; });
	}
	return cached.catalog;
};

/** The catalog changed: every worker rebuilds and connected clients refetch. */
export const invalidateCatalog = async (): Promise<void> => {
	await redis.del(PENDING_KEY);
	await redis.incr(VERSION_KEY);
	hub.broadcast({ type: 'catalog:invalidate' });
};

/** A change clients can wait for: sent with the others, 5 minutes after the first. */
export const deferCatalogInvalidate = async (): Promise<void> => {
	await redis.set(PENDING_KEY, Date.now(), 'NX');
};

export const flushCatalogInvalidate = async (): Promise<void> => {
	const since = Number(await redis.get(PENDING_KEY));
	if (since && Date.now() - since >= BATCH && await redis.del(PENDING_KEY)) await invalidateCatalog();
};

/** After a set edit: going live is sent at once, other changes to a live set are deferred. */
export const setLiveChanged = async (wasLive: boolean, isLive: boolean): Promise<void> => {
	if (isLive && !wasLive) await invalidateCatalog();
	else if (wasLive) await deferCatalogInvalidate();
};

/** What the public listing filters on. */
export const LIST_STATUSES = ['ranked', 'loved', 'unranked', 'any'] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** The listed difficulties of a status in a ruleset: ranked ones, loved ones, players'
 *  unranked uploads, or all of them. */
export const listCondition = (r: ServerRuleset, status: ListStatus) => {
	const unranked = and(
		playerMapCondition(r), ne(beatmapset.id, INTRO_SET_ID), diffsOf(r),
	);
	if (status === 'ranked' || status === 'loved') {
		return and(listedCondition(r), eq(r.setStatus.status, status));
	}
	return status === 'unranked' ? unranked : or(listedCondition(r), unranked);
};

/** When a listed set got there in a ruleset: approved, or uploaded for an unranked one. */
export const listedAt = ({ setStatus }: ServerRuleset) =>
	sql`coalesce(${setStatus.rankedAt}, ${setStatus.submittedAt})`;

/** Sets whose title, artist or mapper contains `search`; everything without one. */
export const nameMatches = (search?: string) => {
	const term = search?.trim();
	if (!term) return undefined;
	const pattern = `%${likeEscape(term)}%`;
	return or(
		like(beatmapset.title, pattern),
		like(beatmapset.artist, pattern),
		like(beatmapset.creator, pattern),
	);
};

/** Every player's own map not ranked yet, catalog-shaped like the ranked catalog. */
export const unrankedSets = () => allCatalogSets(r => listCondition(r, 'unranked'));

/** One player's own map not ranked yet, catalog-shaped for the game to download it. */
export const unrankedSet = async (setId: number): Promise<CatalogSet | undefined> =>
	(await allCatalogSets(r => and(playerMapCondition(r), eq(beatmapset.id, setId))))[0];

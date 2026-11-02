import '@oss-idle/shared/osu/controlPointPatch';

import { execFile } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { extname } from 'node:path';
import { promisify } from 'node:util';

import AdmZip from 'adm-zip';
import {
	and,
	eq,
	isNull,
	notInArray,
} from 'drizzle-orm';
import type {
	Beatmap,
	BeatmapMetadataSection,
} from 'osu-classes';
import { ManiaRuleset } from 'osu-mania-stable';
import { BeatmapDecoder } from 'osu-parsers';
import * as rosu from 'rosu-pp-js';

import {
	INTRO_SET_ID,
	isApproved,
} from '@oss-idle/shared/beatmap';
import { rulesetOf } from '@oss-idle/shared/rulesets/ids';
import {
	fileIdsOf,
	OWN_ID_FROM,
	withFileIds,
} from '@oss-idle/shared/rulesets/mania/editor/chart';

import { db } from '../db/client';
import {
	beatmaps,
	type NewBeatmapRow,
} from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { starsAtRates } from '../pp';
import { KNOWN_MODES } from '../rulesets/enabled';
import { queuedRulesets } from '../rulesets/registry';
import {
	bakeCover,
	osuServesCover,
} from './covers';
import { creditMapper } from './credit';
import {
	seedStatus,
	statusesOf,
	writeStatus,
} from './setStatus';
import {
	BEATMAP_DIR,
	oszPath,
	PREVIEW_DIR,
	previewPath,
} from './storage';
import { timingColumns } from './timingPoints';

/**
 * The single runtime beatmap pipeline - replaces the old client `index-beatmaps`
 * (manifest + previews) and server `ingest-beatmaps` (DB) scripts. Given a raw
 * `.osz`, it parses every mania difficulty, computes star rating + the rich
 * catalog metadata, generates the preview audio/background, stores the `.osz` and
 * previews under their set-id names, and upserts the `beatmapset` + `beatmap`
 * rows. It never touches `status`/`rankedAt`/`announced` on an existing set, so
 * re-ingesting (a re-upload) leaves its nomination state intact - new sets land
 * as `pending`. Ids are ours: osu!'s ids are kept in `osuId`, and the .osz is
 * stored as uploaded - the catalog names each difficulty's file inside it. A
 * player's upload is stored with the ids it got written into its files.
 */

const decoder = new BeatmapDecoder();
const mania = new ManiaRuleset();

export type IngestResult = {
	setId: number;
	osuSetId?: number;
	difficulties: number;
	/** a player's upload: the ids now in its files - the set's, and each .osu's by name */
	ids?: { setId: number, beatmaps: Record<string, number> };
};

/** osu! writes 0 or -1 for a map it doesn't know; an id from 1e9 is ours. */
const osuId = (id: number | undefined) => id && id > 0 && id < OWN_ID_FROM ? id : undefined;

/** The set this upload updates: by osu! id, else an unsubmitted set with the same metadata. */
const findSet = async (
	osuSetId: number | undefined,
	meta: { artist: string, title: string, creator: string },
) => {
	const [row] = await db.select().from(beatmapset).where(osuSetId !== undefined
		? eq(beatmapset.osuId, osuSetId)
		: and(
			isNull(beatmapset.osuId),
			isNull(beatmapset.uploadedAt),
			eq(beatmapset.artist, meta.artist),
			eq(beatmapset.title, meta.title),
			eq(beatmapset.creator, meta.creator),
		)).limit(1);
	return row;
};

/** The difficulty this .osu updates: by our id when the file has one of the set's, by
 *  osu! id, else by name within an unsubmitted set. A player's upload only ever finds one
 *  of its own set's: a file naming another set's difficulty must not take it over. */
const findBeatmap = async (
	setId: number,
	osuBeatmapId: number | null | undefined,
	version: string,
	{ ownId, player }: { ownId?: number, player: boolean },
) => {
	const byOsuId = osuBeatmapId && (player
		? and(eq(beatmaps.osuId, osuBeatmapId), eq(beatmaps.setId, setId))
		: eq(beatmaps.osuId, osuBeatmapId));
	const [row] = await db.select({ id: beatmaps.id }).from(beatmaps).where(ownId
		? and(eq(beatmaps.id, ownId), eq(beatmaps.setId, setId))
		: byOsuId
			|| and(eq(beatmaps.setId, setId), isNull(beatmaps.osuId), eq(beatmaps.version, version)))
		.limit(1);
	return row?.id;
};

/** Finds or creates the set, keeping its nomination state. */
const upsertSet = async (metas: BeatmapMetadataSection[], allowRanked: boolean) => {
	// A pack can carry a stray -1 on some of its difficulties: the first real id wins.
	const osuSetId = metas.map(m => osuId(m.beatmapSetId)).find(id => id !== undefined);
	const meta = metas[0];
	const existing = await findSet(osuSetId, meta);
	const ranked = !!existing && (await statusesOf(existing.id)).some(([, s]) => isApproved(s.status));
	if (ranked && !allowRanked) throw new Error('Beatmap set is already ranked');

	// The intro must be live to be served, but it's never "nominated" - rank it
	// on first ingest (announced so the sweep skips it). Everything else lands as
	// pending in every ruleset. Re-ingest preserves status/rankedAt/announced either way.
	const isIntro = osuSetId === INTRO_SET_ID;
	const setMeta = {
		artist: meta.artist, title: meta.title, creator: meta.creator,
		...osuSetId !== undefined && { osuCover: await osuServesCover(osuSetId) },
	};
	let setId: number;
	if (existing) {
		setId = existing.id;
		await db.update(beatmapset).set({
			...setMeta, deletedAt: null,
		}).where(eq(beatmapset.id, setId));
	} else {
		[{ id: setId }] = await db.insert(beatmapset).values({
			...setMeta, osuId: osuSetId, ...isIntro ? { id: INTRO_SET_ID } : {},
		}).$returningId();
	}
	await seedStatus(setId, isIntro ? {
		status: 'ranked', rankedAt: new Date(), announced: true,
	} : {});
	return {
		setId, osuSetId, ranked,
	};
};

/** A player's own upload: a new `unranked` set they own (linked to `osuSetId`, osu!'s
 *  set it comes from, when they mapped it there), or `setId`, one the route has
 *  checked is theirs to replace. No `userId`: a mapper without an account. */
export type Owner = { userId?: number, setId?: number, osuSetId?: number };

/** Creates or updates a player's own set: unranked, and theirs to manage from now on. */
const ownSet = async (metas: BeatmapMetadataSection[], owner: Owner) => {
	const { artist, title, creator } = metas[0];
	const fields = {
		artist, title, creator, uploadedAt: new Date(), deletedAt: null,
	};
	if (owner.setId === undefined) {
		const [{ id }] = await db.insert(beatmapset).values({
			...fields, ownerUserId: owner.userId, osuId: owner.osuSetId,
			...owner.osuSetId !== undefined && { osuCover: await osuServesCover(owner.osuSetId) },
		}).$returningId();
		await seedStatus(id, { status: 'unranked' });
		return {
			setId: id, osuSetId: owner.osuSetId, ranked: false,
		};
	}
	await db.update(beatmapset).set(fields).where(eq(beatmapset.id, owner.setId));
	// uploadTarget refused a set ranked or queued in any ruleset: it is unranked in all of them
	for (const r of queuedRulesets()) await writeStatus(r, owner.setId, { status: 'unranked' });
	const [set] = await db.select({ osuId: beatmapset.osuId }).from(beatmapset)
		.where(eq(beatmapset.id, owner.setId)).limit(1);
	return {
		setId: owner.setId, osuSetId: set?.osuId ?? undefined, ranked: false,
	};
};

/** A difficulty as stored: its .osu, and the ids it got. */
type Written = { entry: { entryName: string }, text: string, id: number, osuBeatmapId?: number };

/** The ids a difficulty's file gives it: osu!'s (kept by a player's map only when its
 *  set is osu!'s), and ours when a player's file already carries one. */
const difficultyIds = (
	text: string,
	decoded: Beatmap,
	player: boolean,
	osuSetId: number | undefined,
) => {
	const fileId = fileIdsOf(text).beatmapId;
	return {
		osuBeatmapId: player && osuSetId === undefined ? undefined : osuId(decoded.metadata.beatmapId),
		ownId: player && fileId !== undefined && fileId >= OWN_ID_FROM ? fileId : undefined,
	};
};

/** Key count, star rating and note counts of one chart. */
const chartStats = (text: string, decoded: Beatmap) => {
	// Column count needs the mania ruleset; the intro is standard mode, so
	// guard it and leave keys at 0 there (the intro never needs a key count).
	let keys = 0;
	try { keys = mania.applyToBeatmap(decoded).totalColumns; } catch { /* non-mania intro */ }
	let sr = 0, bpm = 0, objects = 0, rice = 0, ln = 0;
	try {
		const map = new rosu.Beatmap(Buffer.from(text));
		sr = new rosu.Difficulty().calculate(map).stars;
		bpm = map.bpm;
		objects = map.nObjects;
		rice = map.nCircles;
		ln = map.nHolds;
		map.free();
	} catch { /* leave defaults if rosu can't read it */ }
	return {
		keys, sr, bpm, objects, rice, ln,
	};
};

/** Writes one difficulty. A ranked set's own difficulties are left as they are. */
const upsertBeatmap = async (
	row: Omit<NewBeatmapRow, 'id'> & { mode: number },
	setRanked: boolean,
	used: Set<number>,
	{ ownId, player }: { ownId?: number, player: boolean },
) => {
	let id = await findBeatmap(row.setId, row.osuId, row.version, {
		ownId, player, 
	});
	if (id === undefined || used.has(id)) {
		[{ id }] = await db.insert(beatmaps).values({
			...row,
			// A diff no ruleset plays lands (and stays) unranked. The intro is
			// standard-mode and must be live, so it's exempt.
			ranked: rulesetOf(row.mode, row.keys) !== undefined || row.setId === INTRO_SET_ID,
		}).$returningId();
	} else if (setRanked) {
		await db.update(beatmaps)
			.set({ file: row.file })
			.where(and(eq(beatmaps.id, id), eq(beatmaps.setId, row.setId)));
	} else {
		await db.update(beatmaps).set(row).where(eq(beatmaps.id, id));
	}
	return id;
};

/** `allowRanked` re-reads a ranked set's own stored file: its difficulties stay as
 *  they are, and the ones it never had are added like any other. With an `owner`,
 *  it is a player's own upload (see {@link Owner}). */
export const ingestOsz = async (
	buffer: Buffer,
	{ allowRanked = false, owner }: { allowRanked?: boolean, owner?: Owner } = {},
): Promise<IngestResult> => {
	const zip = new AdmZip(buffer);
	const entries = zip.getEntries();
	const findEntry = (name: string) =>
		entries.find(e => e.entryName.toLowerCase() === name.toLowerCase());

	// osu! only reads the set's root: a nested .osu is a stale copy (e.g. an old
	// set's folder zipped along) - unless the pack has nothing at its root.
	const osuEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('.osu'));
	const rootOnly = osuEntries.filter(e => !e.entryName.includes('/'));
	const parsed = (rootOnly.length ? rootOnly : osuEntries)
		.flatMap(entry => {
			const text = entry.getData().toString('utf8');
			let decoded;
			try { decoded = decoder.decodeFromString(text); } catch { return []; }
			// a mode some ruleset plays, and the standard-mode intro set (never a player's)
			const isIntro = !owner && decoded.metadata.beatmapSetId === INTRO_SET_ID;
			if (!KNOWN_MODES.has(decoded.originalMode) && !isIntro) return [];
			return [{
				entry, text, decoded,
			}];
		});

	if (parsed.length === 0) throw new Error('No mania difficulties in this .osz');

	const metas = parsed.map(p => p.decoded.metadata);
	const { setId, osuSetId, ranked } = owner
		? await ownSet(metas, owner)
		: await upsertSet(metas, allowRanked);
	if (osuSetId !== undefined) await creditMapper(setId, osuSetId);

	mkdirSync(BEATMAP_DIR, { recursive: true });
	mkdirSync(PREVIEW_DIR, { recursive: true });

	// 1. Extract each distinct background / audio source once, named by set id.
	//    Difficulties sharing a source get the same preview filename.
	const bgAssets = new Map<string, string | undefined>();
	const audioAssets = new Map<string, string | undefined>();

	const resolveBackground = (bg: string | undefined): string | undefined => {
		if (!bg) return undefined;
		const key = bg.toLowerCase();
		if (bgAssets.has(key)) return bgAssets.get(key);
		const entry = findEntry(bg);
		if (!entry) { bgAssets.set(key, undefined); return undefined; }
		const ext = extname(bg) || '.jpg';
		const idx = bgAssets.size;
		const out = idx === 0 ? `${setId}${ext}` : `${setId}-bg${idx}${ext}`;
		writeFileSync(previewPath(out), entry.getData());
		bgAssets.set(key, out);
		return out;
	};

	const resolveAudio = async (
		audio: string | undefined,
		previewTimeMs: number,
	): Promise<string | undefined> => {
		if (!audio) return undefined;
		const key = audio.toLowerCase();
		if (audioAssets.has(key)) return audioAssets.get(key);
		const entry = findEntry(audio);
		if (!entry) { audioAssets.set(key, undefined); return undefined; }
		const idx = audioAssets.size;
		const out = idx === 0 ? `${setId}.mp3` : `${setId}-audio${idx}.mp3`;
		const temp = previewPath(`${setId}_temp${idx}${extname(audio)}`);
		writeFileSync(temp, entry.getData());
		const start = previewTimeMs > 0 ? (previewTimeMs / 1000).toFixed(2) : '40.00';
		let result: string | undefined;
		try {
			// a player's file: read from disk only, and only as audio
			await promisify(execFile)('ffmpeg', [
				'-y', '-protocol_whitelist', 'file', '-format_whitelist', 'mp3,ogg,wav,flac,aac,mov',
				'-ss', start, '-i', temp, '-t', '10',
				'-c:a', 'libmp3lame', '-q:a', '4', previewPath(out),
			], { timeout: 30_000 });
			result = out;
		} catch (err) {
			console.error(`  ffmpeg failed to create preview for ${setId}:`, err);
		} finally {
			if (existsSync(temp)) rmSync(temp);
		}
		audioAssets.set(key, result);
		return result;
	};

	// 2. Build + upsert the difficulty rows.
	const used = new Set<number>();
	const written: Written[] = [];
	for (const { entry, text, decoded } of parsed) {
		const stats = chartStats(text, decoded);
		const { osuBeatmapId, ownId } = difficultyIds(text, decoded, !!owner, osuSetId);
		const row = {
			osuId: osuBeatmapId,
			setId,
			file: entry.entryName,
			chart: text,
			sr: String(Math.round(stats.sr * 1000) / 1000),
			rateStars: starsAtRates(text),
			artist: decoded.metadata.artist,
			title: decoded.metadata.title,
			version: decoded.metadata.version,
			keys: stats.keys,
			total_length: Math.round(decoded.totalLength),
			bpm: Math.round(stats.bpm),
			objects: stats.objects,
			rice: stats.rice,
			ln: stats.ln,
			...timingColumns(text),
			mode: decoded.originalMode,
			audio: await resolveAudio(decoded.general.audioFilename, decoded.general.previewTime),
			background: resolveBackground(decoded.events.backgroundPath ?? undefined),
		};

		const id = await upsertBeatmap(row, ranked, used, {
			ownId, player: !!owner, 
		});
		used.add(id);
		written.push({
			entry, text, id, osuBeatmapId,
		});
	}

	// 2b. Each background's card cover, beside it.
	await Promise.all([...new Set(bgAssets.values())]
		.filter((file): file is string => file !== undefined)
		.map(bakeCover));

	// A player's re-upload is the whole set: difficulties it no longer has go.
	if (owner) {
		await db.delete(beatmaps).where(and(eq(beatmaps.setId, setId), notInArray(beatmaps.id, [...used])));
	}

	const ids = owner ? await writeIds(zip, written, osuSetId ?? setId) : undefined;

	// 3. Store the .osz keyed by set id.
	writeFileSync(oszPath(setId), ids ? zip.toBuffer() : buffer);

	return {
		setId, osuSetId, difficulties: used.size, ids,
	};
};

/** A player's upload with its ids written into each .osu (osu!'s where the map has
 *  them, ours otherwise), in the stored charts and in `zip`; returns them by file. */
const writeIds = async (
	zip: AdmZip,
	written: Written[],
	fileSetId: number,
): Promise<NonNullable<IngestResult['ids']>> => {
	const ids: Record<string, number> = {};
	for (const { entry, text, id, osuBeatmapId } of written) {
		const beatmapId = osuBeatmapId ?? id;
		const stamped = withFileIds(text, {
			setId: fileSetId, beatmapId,
		});
		await db.update(beatmaps).set({ chart: stamped }).where(eq(beatmaps.id, id));
		zip.updateFile(entry.entryName, Buffer.from(stamped, 'utf8'));
		ids[entry.entryName] = beatmapId;
	}
	return {
		setId: fileSetId, beatmaps: ids,
	};
};

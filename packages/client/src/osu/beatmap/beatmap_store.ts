import '@oss-idle/shared/osu/controlPointPatch';

import {
	strToU8,
	Unzipped,
} from 'fflate';
import { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import Synced from '@oss-idle/shared/helpers/synced';

import { library } from '../../library';
import {
	Manifest,
	Metadata,
	VersionMetadata,
} from './beatmap_api';
import {
	diskAllMeta,
	diskChart,
	diskCharts,
	diskFile,
	diskFiles,
	diskMeta,
	diskOsbName,
	putDiskSet,
	removeAllDiskSets,
	removeDiskSet,
	updateDiskSet,
} from './diskSets';
import type LightBeatmap from './LightBeatmap';
import LightBeatmapSet from './LightBeatmapSet';
import {
	chartFile,
	isChart,
	mime,
	normalizeName,
} from './setFiles';
import {
	forgetThumbnails,
	setThumbnailKey,
	type Thumbnail,
	thumbnail,
} from './thumbnails';

const DB_NAME = 'beatmaps';
const DB_VERSION = 3;

function fileKey(setId: number, name: string): string {
	return `${setId}/${normalizeName(name)}`;
}

/** Audio names (normalized) among `candidates` that nothing kept still uses:
 *  not a kept version's song audio, and not mentioned by name in any kept chart
 *  or storyboard text (keysounds / storyboard samples). Those need not be
 *  stored - song audio is the heaviest asset and mobile storage is tight. */
const orphanedAudio = (
	candidates: Iterable<string>,
	keptAudio: Set<string>,
	texts: string[],
): string[] => {
	const lower = texts.map(text => text.toLowerCase());
	return [...new Set(candidates)].filter(audio => {
		if (!audio || keptAudio.has(audio)) return false;
		const bare = audio.split('/').pop()!;
		return !lower.some(text => text.includes(bare));
	});
};

// Discriminate a LightBeatmap from a decoded Beatmap structurally rather than
// with `instanceof`, which is fragile across dev HMR / circular imports: a stale
// class identity makes instanceof falsely return false. A decoded Beatmap has a
// `general` section; LightBeatmap does not.
const isLightBeatmap = (b: Beatmap | LightBeatmap): b is LightBeatmap => 
	!('general' in b);

export type RuntimeMetadata = {
	id: number,
	runtime: true,
	title: string,
	artist: string,
	creator: string,
	background: string,
	audio: string,
	versions: RuntimeVersionMetadata[],
};

export type RuntimeVersionMetadata = {
	id: number,
	runtime: true,
	/** the .osu's name in the archive; missing on sets stored before it was kept */
	file?: string,
	version: string,
	difficulty: number,
	mode: number,
	keys: number,
	audio: string,
	background: string,
	previewTime: number,
	total_length: number,
	bpm: number,
	objects: number,
	rice: number,
	ln: number,
};

/** Bumped whenever the stored library changes (e.g. a wipe), so views like the
 *  song-select carousel can reload off it. */
export const beatmapsVersion = new Synced(0);

/** What storing a set needs: catalog metadata, or a local import's own. */
export type StoreMetadata = Pick<
	Metadata, 'id' | 'artist' | 'title' | 'creator' | 'audio' | 'background'
> & {
	versions: Pick<VersionMetadata, 'id' | 'file' | 'difficulty'>[],
};

export type SetRecord = {
	setId: number,
	metadata: RuntimeMetadata,
	osu: Record<number, string>,
};

let dbPromise: Promise<IDBDatabase> | undefined;
const db = (): Promise<IDBDatabase> => {
	return dbPromise ??= (() => {
		console.log('[beatmaps] db() opening...');
		return open().then(async (d) => {
			console.log('[beatmaps] open resolved, running data migrations');
			await runDataMigrations(d);
			console.log('[beatmaps] db() ready');
			return d;
		}).catch((err) => {
			console.error('[beatmaps] db() failed', err);
			dbPromise = undefined;
			throw err;
		});
	})();
};

/**
 * Open the store, (re)creating object stores on a structural version bump.
 * `onupgradeneeded` must stay purely structural and synchronous: it runs inside
 * the versionchange transaction, so any async work or error there aborts the
 * open and leaves the *entire* store unreachable until reset. Anything that
 * touches stored records (e.g. backfilling a new field) belongs in
 * `runDataMigrations`, which runs afterwards on the open DB and can't brick it.
 */
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
	console.log(`[beatmaps] indexedDB.open(${DB_NAME}, v${DB_VERSION})`);
	const req = indexedDB.open(DB_NAME, DB_VERSION);
	req.onupgradeneeded = (event) => {
		const d = req.result;
		console.log(
			`[beatmaps] onupgradeneeded ${event.oldVersion} -> ${event.newVersion}; stores: [${Array.from(d.objectStoreNames)}]`,
		);
		// Pre-v2 layouts are incompatible - drop and rebuild. v2→v3 added no
		// stores (total_length is data, backfilled below), so nothing to do there.
		if (event.oldVersion < 2) {
			for (const name of Array.from(d.objectStoreNames)) d.deleteObjectStore(name);
			d.createObjectStore('meta', { keyPath: 'id' });
			d.createObjectStore('charts');
			d.createObjectStore('files');
			console.log('[beatmaps] created stores meta/charts/files');
		}
	};
	req.onsuccess = () => {
		console.log(
			`[beatmaps] open onsuccess, version ${req.result.version}, stores: [${Array.from(req.result.objectStoreNames)}]`,
		);
		resolve(req.result);
	};
	req.onerror = () => {
		console.error('[beatmaps] open onerror', req.error);
		reject(req.error);
	};
	// A connection still open at the old version (e.g. another tab) stalls the
	// upgrade indefinitely - fail loudly instead of hanging the whole game.
	req.onblocked = () => {
		console.error(
			'[beatmaps] open onblocked - another tab/connection holds an older version',
		);
		reject(new Error('beatmaps DB upgrade blocked by another open tab'));
	};
});

/**
 * Data migrations, mirroring the sql.js DAO (db/migrations.ts): an ordered list
 * run on the *open* database in ordinary transactions, gated by a counter in
 * localStorage. Unlike IndexedDB's structural versioning a failure here only
 * retries next load - it can't make the store unreachable. Each must be
 * idempotent; append to ship a new one, never edit a released entry in place.
 */
type DataMigration = (d: IDBDatabase) => Promise<void>;

const DATA_VERSION_KEY = 'beatmaps.dataVersion';

const dataMigrations: DataMigration[] = [
	backfillTotalLength,
	backfillTopMetadata,
];

async function runDataMigrations(d: IDBDatabase): Promise<void> {
	let version = 0;
	try {
		version = Number(localStorage.getItem(DATA_VERSION_KEY)) || 0;
	} catch { /* localStorage unavailable: re-run from 0 */ }

	console.log(
		`[beatmaps] data migrations at v${version}, target v${dataMigrations.length}`,
	);
	for (let v = version; v < dataMigrations.length; v++) {
		console.log(`[beatmaps] running data migration ${v} -> ${v + 1}`);
		await dataMigrations[v](d);
		try {
			localStorage.setItem(DATA_VERSION_KEY, String(v + 1));
		} catch { /* ignore */ }
		console.log(`[beatmaps] data migration ${v} -> ${v + 1} done`);
	}
}

const withStore = <T>(
	d: IDBDatabase, 
	store: string, 
	mode: IDBTransactionMode, 
	fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const r = fn(d.transaction(store, mode).objectStore(store));
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

/**
 * Backfill `total_length` by decoding the .osu text already held in `charts`,
 * rather than forcing a re-download. Idempotent: skips versions that already
 * have it, and a chart that fails to decode is left for a later re-download
 * instead of aborting the run.
 */
async function backfillTotalLength(d: IDBDatabase): Promise<void> {
	const metas = await withStore(d, 'meta', 'readonly', 
		(s) => s.getAll(),
	) as RuntimeMetadata[];
	const decoder = new BeatmapDecoder();
	console.log(`[beatmaps] backfillTotalLength: ${metas.length} sets`);

	let updated = 0;
	for (const meta of metas) {
		const osu = await withStore(d, 'charts', 'readonly', 
			(s) => s.get(meta.id),
		) as Record<number, string> | undefined;
		if (!osu) {
			console.warn(`[beatmaps] no charts for set ${meta.id}, skipping`);
			continue;
		}

		let changed = false;
		for (const version of meta.versions) {
			if (typeof version.total_length === 'number') continue;
			const text = osu[version.id];
			if (text === undefined) continue;
			try {
				version.total_length = decoder.decodeFromString(text).totalLength;
				changed = true;
			} catch (err) {
				console.error(
					`[beatmaps] total_length backfill failed for ${meta.id}/${version.id}`
					, err);
			}
		}
		if (changed) {
			await withStore(d, 'meta', 'readwrite', (s) => s.put(meta));
			updated++;
		}
	}
	console.log(`[beatmaps] backfillTotalLength: updated ${updated} sets`);
}

async function backfillTopMetadata(d: IDBDatabase): Promise<void> {
	const metas = await withStore(d, 'meta', 'readonly', 
		(s) => s.getAll(),
	) as RuntimeMetadata[];
	const decoder = new BeatmapDecoder();
	console.log(`[beatmaps] backfillTopMetadata: ${metas.length} sets`);

	let updated = 0;
	for (const meta of metas) {
		const osu = await withStore(d, 'charts', 'readonly', 
			(s) => s.get(meta.id),
		) as Record<number, string> | undefined;
		if (!osu) {
			console.warn(`[beatmaps] no charts for set ${meta.id}, skipping`);
			continue;
		}

		let changed = false;
		for (const version of meta.versions) {
			// if (typeof version.bpm === 'number') continue;
			const text = osu[version.id];
			if (text === undefined) continue;
			try {
				const beatmap = decoder.decodeFromString(text);
				version.bpm = beatmap.bpm;
				version.objects = beatmap.hitObjects.length;
				version.rice = beatmap.hitObjects.filter(h => h.hitType === 1).length;
				version.ln = beatmap.hitObjects.filter(h => h.hitType === 128).length;
				changed = true;
			} catch (err) {
				console.error(
					`[beatmaps] top metadata backfill failed for ${meta.id}/${version.id}`
					, err);
			}
		}
		if (changed) {
			await withStore(d, 'meta', 'readwrite', (s) => s.put(meta));
			updated++;
		}
	}
	console.log(`[beatmaps] backfillTopMetadata: updated ${updated} sets`);
}

const request = async <T>(
	store: string, 
	mode: IDBTransactionMode, 
	fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
	console.log(`[beatmaps] request ${mode} on '${store}'`);
	return db().then((d) => new Promise<T>((resolve, reject) => {
		const r = fn(d.transaction(store, mode).objectStore(store));
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => {
			console.error(`[beatmaps] request error on '${store}'`, r.error);
			reject(r.error);
		};
	}));
};

/** A set's metadata and kept charts out of its files, and the audio only the charts left
 *  out (not in `metadata`) use. */
export const deriveSet = (metadata: StoreMetadata, files: Unzipped) => {
	const decoder = new TextDecoder();
	
	const runtimeMetadata: RuntimeMetadata = {
		id: metadata.id,
		runtime: true,
		artist: metadata.artist,
		creator: metadata.creator,
		title: metadata.title,
		versions: [],

		// placeholders, overwritten below from the actual .osu files
		audio: metadata.audio ?? '',
		background: metadata.background ?? '',
	};

	const keptAudio = new Set<string>();
	const droppedAudio = new Set<string>();

	const osu = Object.keys(files)
		.filter(isChart)
		.reduce((set, file) => {
			const text = decoder.decode(files[file]);
			const beatmap = (new BeatmapDecoder()).decodeFromString(text);
			const meta = metadata.versions.find(v => v.file
				? v.file === file
				: v.id === beatmap.metadata.beatmapId);
			const audio = beatmap.general.audioFilename;

			if (!meta) {
				if (audio) droppedAudio.add(normalizeName(audio));
				return set;
			}
			if (audio) keptAudio.add(normalizeName(audio));

			set[meta.id] = text;

			runtimeMetadata.audio = beatmap.general.audioFilename;
			if (beatmap.events.backgroundPath) {
				runtimeMetadata.background = beatmap.events.backgroundPath;
			}

			runtimeMetadata.versions.push({
				id: meta.id,
				runtime: true,
				file,
				audio: beatmap.general.audioFilename,
				background: beatmap.events.backgroundPath ?? runtimeMetadata.background,
				difficulty: meta.difficulty,
				keys: beatmap.difficulty.circleSize,
				mode: beatmap.mode,
				version: beatmap.metadata.version,
				previewTime: beatmap.general.previewTime,
				total_length: beatmap.totalLength,
				bpm: beatmap.bpm,
				objects: beatmap.hitObjects.length,
				rice: beatmap.hitObjects.filter(h => h.hitType === 1).length,
				ln: beatmap.hitObjects.filter(h => h.hitType === 128).length,
			});
			return set;
		}, {} as Record<number, string>);

	// Audio only the dropped (not in the catalog = unranked) charts use.
	const osbTexts = Object.keys(files)
		.filter(name => name.toLowerCase().endsWith('.osb'))
		.map(name => decoder.decode(files[name]));
	const skippedAudio = new Set(orphanedAudio(
		droppedAudio, keptAudio, [...Object.values(osu), ...osbTexts],
	));
	return {
		runtimeMetadata, osu, skippedAudio,
	};
};

/** Every file IndexedDB holds for a set but its charts, by normalized name. */
const storedFiles = async (d: IDBDatabase, setId: number): Promise<Unzipped> => {
	const prefix = `${setId}/`;
	const blobs = await new Promise<[string, Blob][]>((resolve, reject) => {
		const found: [string, Blob][] = [];
		const cursor = d.transaction('files', 'readonly').objectStore('files')
			.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
		cursor.onerror = () => reject(cursor.error);
		cursor.onsuccess = () => {
			const c = cursor.result;
			if (!c) return resolve(found);
			found.push([String(c.key).slice(prefix.length), c.value as Blob]);
			c.continue();
		};
	});
	return Object.fromEntries(await Promise.all(blobs.map(async ([name, blob]) =>
		[name, new Uint8Array(await blob.arrayBuffer())] as const)));
};

/** The sets IndexedDB held, moved into the maps folder. IndexedDB goes once all moved. */
const moveToDisk = async (): Promise<void> => {
	if (!(await indexedDB.databases()).some(known => known.name === DB_NAME)) return;
	const d = await db();
	const metas = await withStore(d, 'meta', 'readonly', s => s.getAll()) as RuntimeMetadata[];
	let failed = false;
	for (const meta of metas) {
		try {
			if (await diskMeta(meta.id)) continue;
			const osu = await withStore(d, 'charts', 'readonly', s => s.get(meta.id)) as
				Record<number, string> | undefined;
			const files = await storedFiles(d, meta.id);
			for (const version of meta.versions) {
				const text = osu?.[version.id];
				if (text === undefined) continue;
				version.file = chartFile(meta, version);
				files[version.file] = strToU8(text);
			}
			await putDiskSet(meta, files, false);
		} catch (e) {
			failed = true;
			console.error(`[beatmaps] moving set ${meta.id} to its folder failed`, e);
		}
	}
	if (failed) return;
	d.close();
	dbPromise = undefined;
	indexedDB.deleteDatabase(DB_NAME);
};

let moved: Promise<void> | undefined;

/** Whether sets live in the maps folder (desktop), once IndexedDB's moved there. */
export const onDisk = async (): Promise<boolean> => {
	if (!library()) return false;
	await (moved ??= moveToDisk());
	return true;
};

/** Free a URL `getFileUrl` made; others are left alone. */
export const revokeBlob = (url?: string) => {
	if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

export default class BeatmapStore {

	/** Store a set's files; with `replace`, what it held before goes in the same
	 *  transaction, so a failed write leaves the old set whole. */
	public static async storeOsz(
		metadata: StoreMetadata,
		files: Unzipped,
		replace = false,
	): Promise<SetRecord> {
		const { runtimeMetadata, osu, skippedAudio } = deriveSet(metadata, files);

		if (await onDisk()) {
			const kept = new Set(runtimeMetadata.versions.map(version => version.file));
			await putDiskSet(runtimeMetadata, Object.fromEntries(Object.entries(files)
				.filter(([name]) => (isChart(name) ? kept.has(name) : !skippedAudio.has(normalizeName(name))))),
			replace);
		} else {
			const d = await db();
			await new Promise<void>((resolve, reject) => {
				const tx = d.transaction(['meta', 'charts', 'files'], 'readwrite');
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);

				tx.objectStore('meta').put(runtimeMetadata);
				tx.objectStore('charts').put(osu, metadata.id);

				// store every bundled asset (keysounds, storyboard samples, video, .osb)
				// except the charts, which live in `charts`, and audio no kept chart
				// uses. Paths are kept verbatim so references resolve against the
				// original archive structure.
				const fs = tx.objectStore('files');
				if (replace) fs.delete(IDBKeyRange.bound(`${metadata.id}/`, `${metadata.id}/\uffff`));
				for (const name of Object.keys(files)) {
					if (isChart(name)) continue;
					if (skippedAudio.has(normalizeName(name))) continue;
					fs.put(
						new Blob([files[name]], { type: mime(name) }),
						fileKey(metadata.id, name),
					);
				}
			});
		}
		await forgetThumbnails(metadata.id);
		void beatmapsVersion.set(beatmapsVersion.get() + 1);

		return {
			setId: metadata.id, metadata: runtimeMetadata, osu, 
		};
	}

	/** Drop stored versions the live catalog no longer lists (diffs unranked
	 *  after download), so they disappear like they never existed. Sets absent
	 *  from the catalog entirely are kept: that's the unranked-set local
	 *  fallback, not a diff toggle. A listed version the set lacks shows as not
	 *  downloaded, and downloading it fetches the set again. */
	public static async pruneToManifest(manifest: Manifest): Promise<void> {
		const listed = new Map<number, Set<number>>();
		const index = (set: { id: number; versions: { id: number }[] } | undefined) =>
			set && listed.set(set.id, new Set(set.versions.map(v => v.id)));
		index(manifest.intro);
		manifest.beatmaps.forEach(index);

		const metas = await onDisk() ? await diskAllMeta() : await withStore(await db(), 'meta', 'readonly',
			(s) => s.getAll(),
		) as RuntimeMetadata[];

		let changed = false;
		for (const meta of metas) {
			const keep = listed.get(meta.id);
			if (!keep || meta.versions.every(v => keep.has(v.id))) continue;
			await this.keepVersions(meta, keep);
			changed = true;
		}
		if (changed) void beatmapsVersion.set(beatmapsVersion.get() + 1);
	}

	/** Delete one stored difficulty, or its whole set when it is the last one. */
	public static async deleteVersion(setId: number, beatmapId: number): Promise<void> {
		const meta = await this.meta(setId);
		const keep = new Set(meta?.versions.map(v => v.id).filter(id => id !== beatmapId));
		if (!meta || !keep.size) return this.deleteSet(setId);
		await this.keepVersions(meta, keep);
		void beatmapsVersion.set(beatmapsVersion.get() + 1);
	}

	/** Drop a set's versions not in `keep`, with the audio only they used (mobile storage). */
	private static async keepVersions(meta: RuntimeMetadata, keep: Set<number>): Promise<void> {
		const dropped = meta.versions.filter(v => !keep.has(v.id));
		meta.versions = meta.versions.filter(v => keep.has(v.id));
		const osu = await this.charts(meta.id);
		if (osu) {
			for (const id of Object.keys(osu)) {
				if (!keep.has(Number(id))) delete osu[Number(id)];
			}
		}

		const texts = Object.values(osu ?? {});
		const osb = await this.getOsbText(meta.id);
		if (osb) texts.push(osb);
		const staleAudio = orphanedAudio(
			dropped.map(v => normalizeName(v.audio)),
			new Set(meta.versions.map(v => normalizeName(v.audio))),
			texts,
		);

		if (await onDisk()) {
			await updateDiskSet(meta, [
				...dropped.flatMap(v => (v.file ? [v.file] : [])),
				...staleAudio,
			]);
			return;
		}
		const d = await db();
		await new Promise<void>((resolve, reject) => {
			const tx = d.transaction(['meta', 'charts', 'files'], 'readwrite');
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.objectStore('meta').put(meta);
			if (osu) tx.objectStore('charts').put(osu, meta.id);
			for (const name of staleAudio) tx.objectStore('files').delete(fileKey(meta.id, name));
		});
	}

	public static async has(setId: number): Promise<boolean> {
		if (await onDisk()) return (await diskMeta(setId)) !== undefined;
		return (await request('meta', 'readonly', 
			(s) => s.getKey(setId),
		)) !== undefined;
	}

	/** Wipe every downloaded set (metadata, charts and media) and notify views. */
	public static async deleteAll(): Promise<void> {
		if (await onDisk()) {
			await removeAllDiskSets();
		} else {
			const d = await db();
			await new Promise<void>((resolve, reject) => {
				const tx = d.transaction(['meta', 'charts', 'files'], 'readwrite');
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.objectStore('meta').clear();
				tx.objectStore('charts').clear();
				tx.objectStore('files').clear();
			});
		}
		await forgetThumbnails();
		void beatmapsVersion.set(beatmapsVersion.get() + 1);
	}

	/** Delete one downloaded set (its metadata, charts and media) and notify
	 *  views. Files are key `${setId}/<name>`, so a prefix range drops them all. */
	public static async deleteSet(setId: number): Promise<void> {
		if (await onDisk()) {
			await removeDiskSet(setId);
		} else {
			const d = await db();
			await new Promise<void>((resolve, reject) => {
				const tx = d.transaction(['meta', 'charts', 'files'], 'readwrite');
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.objectStore('meta').delete(setId);
				tx.objectStore('charts').delete(setId);
				const files = tx.objectStore('files');
				const cursor = files.openKeyCursor(
					IDBKeyRange.bound(`${setId}/`, 
						`${setId}/\uffff`,
					),
				);
				cursor.onsuccess = () => {
					const c = cursor.result;
					if (!c) return;
					files.delete(c.primaryKey);
					c.continue();
				};
			});
		}
		await forgetThumbnails(setId);
		void beatmapsVersion.set(beatmapsVersion.get() + 1);
	}

	private static async meta(setId: number): Promise<RuntimeMetadata | undefined> {
		if (await onDisk()) return diskMeta(setId);
		return await request('meta', 'readonly', 
			(s) => s.get(setId),
		) as RuntimeMetadata | undefined;
	}

	private static async charts(setId: number): Promise<Record<number, string> | undefined> {
		if (await onDisk()) return diskCharts(setId);
		return request<Record<number, string> | undefined>('charts', 'readonly', 
			(s) => s.get(setId),
		);
	}

	private static async file(setId: number, name: string): Promise<Blob | undefined> {
		if (await onDisk()) return diskFile(setId, name);
		return request<Blob | undefined>('files', 'readonly', 
			(s) => s.get(fileKey(setId, name)),
		);
	}

	public static async getBeatmapSet(
		setId: number,
	): Promise<LightBeatmapSet | undefined> {
		const meta = await this.meta(setId);
		if (!meta) return;
		return LightBeatmapSet.fromMetadata(meta);
	}

	// every play reads the whole library a few times: it is built once per library version
	private static allSets?: { version: number, sets: Promise<LightBeatmapSet[]> };

	public static getAllSets(): Promise<LightBeatmapSet[]> {
		const version = beatmapsVersion.get();
		if (this.allSets?.version === version) return this.allSets.sets;
		const sets = this.readAllSets();
		this.allSets = {
			version, sets,
		};
		sets.catch(() => {
			if (this.allSets?.sets === sets) this.allSets = undefined;
		});
		return sets;
	}

	private static async readAllSets(): Promise<LightBeatmapSet[]> {
		const metas = await onDisk() ? await diskAllMeta() : (await request('meta', 'readonly',
			(s) => s.getAll(),
		)) as RuntimeMetadata[];
		return metas.map(meta => LightBeatmapSet.fromMetadata(meta));
	}

	public static async getSet(setId: number): Promise<SetRecord | undefined> {
		const mapset = await this.getBeatmapSet(setId);
		if (!mapset || !mapset.metadata.runtime) return undefined;
		const osu = (await this.charts(setId))!;
		return {
			setId, metadata: mapset.metadata, osu, 
		};
	}

	public static async getOsu(
		setId: number, 
		beatmapId: number,
	): Promise<string | undefined> {
		if (await onDisk()) return diskChart(setId, beatmapId);
		return (await this.charts(setId))?.[beatmapId];
	}

	public static async getFileUrl(
		setId: number, 
		name: string,
	): Promise<string | undefined> {
		const blob = await this.file(setId, name);
		return blob && URL.createObjectURL(blob);
	}

	/** Resolve a sound sample blob URL. osu looks up samples extension-insensitively
	 *  (a map referencing `kick.wav` plays as `kick.ogg`), so fall back to the
	 *  basename with each known audio extension when the exact path isn't stored. */
	public static async getSampleUrl(
		setId: number,
		name: string,
	): Promise<string | undefined> {
		const direct = await this.getFileUrl(setId, name);
		if (direct) return direct;
		const dot = name.lastIndexOf('.');
		const base = dot >= 0 ? name.slice(0, dot) : name;
		for (const ext of ['wav', 'ogg', 'mp3']) {
			const url = await this.getFileUrl(setId, `${base}.${ext}`);
			if (url) return url;
		}
		return undefined;
	}

	/** Every stored file of a set but its charts: by normalized name in IndexedDB, by
	 *  its path in the folder on disk. */
	public static async getFiles(setId: number): Promise<Unzipped> {
		if (await onDisk()) return diskFiles(setId);
		return storedFiles(await db(), setId);
	}

	/** Decode a stored text asset (e.g. a `.osb` storyboard) to a string. */
	public static async getFileText(
		setId: number, 
		name: string,
	): Promise<string | undefined> {
		return (await this.file(setId, name))?.text();
	}

	/** The set's `.osb` storyboard text, if it bundled one. */
	public static async getOsbText(setId: number): Promise<string | undefined> {
		if (await onDisk()) {
			const name = await diskOsbName(setId);
			return name ? this.getFileText(setId, name) : undefined;
		}
		const d = await db();
		const name = await new Promise<string | undefined>((resolve, reject) => {
			const cursor = d.transaction('files', 'readonly').objectStore('files')
				.openKeyCursor(IDBKeyRange.bound(`${setId}/`, `${setId}/\uffff`));
			cursor.onerror = () => reject(cursor.error);
			cursor.onsuccess = () => {
				const c = cursor.result;
				if (!c) return resolve(undefined);
				if (String(c.key).endsWith('.osb')) 
					return resolve(String(c.key).slice(`${setId}/`.length));
				c.continue();
			};
		});
		return name ? this.getFileText(setId, name) : undefined;
	}

	public static getBeatmapAudio(
		beatmap: Beatmap | LightBeatmap,
	): Promise<string | undefined> {
		if (isLightBeatmap(beatmap)) {
			if (!beatmap.metadata.runtime) return beatmap.getAudioUri();
			return beatmap.metadata.audio ? 
				this.getFileUrl(beatmap.set.metadata.id, beatmap.metadata.audio) : 
				Promise.resolve(undefined);
		}
		const audio = beatmap.general.audioFilename;
		return audio ? 
			this.getFileUrl(beatmap.metadata.beatmapSetId, audio) : 
			Promise.resolve(undefined);
	}

	public static getBeatmapBackground(
		beatmap: Beatmap | LightBeatmap,
	): Promise<string | undefined> {
		if (isLightBeatmap(beatmap)) {
			if (!beatmap.metadata.runtime) return beatmap.getBackgroundUri();
			return beatmap.metadata.background ? 
				this.getFileUrl(beatmap.set.metadata.id, beatmap.metadata.background) :
				Promise.resolve(undefined);
		}
		const bg = beatmap.events.backgroundPath;
		return bg ? 
			this.getFileUrl(beatmap.metadata.beatmapSetId, bg) : 
			Promise.resolve(undefined);
	}

	/** The beatmap's small cover for cards, baked from its background. */
	public static getBeatmapThumbnail(beatmap: LightBeatmap): Thumbnail | undefined {
		const { background, runtime } = beatmap.metadata;
		if (!background) return undefined;
		if (!runtime) {
			const get = async (url: string | undefined) => {
				const res = await fetch(url!);
				return res.ok ? res.blob() : undefined;
			};
			// the server's cover (`<background file>.cover.jpg`), else the full background baked here
			return thumbnail(
				background,
				async () => get(await beatmap.getBackgroundUri()),
				async () => get(`${await beatmap.getBackgroundUri()}.cover.jpg`),
			);
		}
		const setId = beatmap.set.metadata.id;
		const key = setThumbnailKey(setId, normalizeName(background));
		return thumbnail(key, () => this.file(setId, background));
	}

}

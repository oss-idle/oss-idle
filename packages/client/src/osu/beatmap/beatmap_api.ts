import {
	unzip,
	Unzipped,
} from 'fflate';
import type { InferResponseType } from 'hono/client';

import sleep from '@oss-idle/shared/helpers/sleep';

import { SETTINGS } from '../../db/settings';
import API from '../../online/api';
import {
	BASE_URL,
	rpc,
	withAuth,
} from '../../online/client';
import Socket from '../../online/socket';
import BeatmapStore, {
	beatmapsVersion,
	SetRecord,
} from './beatmap_store';
import type LightBeatmap from './LightBeatmap';

/** The live catalog and its metadata types, as returned by the server. */
export type Manifest = InferResponseType<typeof rpc.v1.beatmap.catalog.$get>;
export type Metadata = Manifest['beatmaps'][number];
export type VersionMetadata = Metadata['versions'][number];

const PARALLEL_DOWNLOADS = 4;
let downloading = 0;
const waiting: (() => void)[] = [];

/** Waits for one of the parallel download slots; call the result to hand it on. */
const downloadSlot = async (): Promise<() => void> => {
	if (downloading < PARALLEL_DOWNLOADS) downloading++;
	else await new Promise<void>(resolve => waiting.push(resolve));
	return () => {
		const next = waiting.shift();
		if (next) next();
		else downloading--;
	};
};

/** In song select before it is downloaded. */
export const isListed = (meta: Metadata) =>
	SETTINGS.showUndownloaded.get() && (meta.bundled || SETTINGS.showUnbundled.get());

export default class BeatmapAPI {

	private static manifest?: Promise<Manifest>;

	/** Resolve a catalog asset path (preview audio/background, already
	 *  server-rooted as `/v1/beatmap/preview/...`) to a full URL on the API. */
	public static assetUrl(path: string | undefined): string | undefined {
		if (!path) return undefined;
		return `${BASE_URL}${path}`;
	}

	/** Drop the cached catalog and bump the library version so song select
	 *  refetches. Pushed by the server when the catalog changes. */
	public static invalidate(): void {
		this.manifest = undefined;
		void beatmapsVersion.set(beatmapsVersion.get() + 1);
	}

	public static getManifest(): Promise<Manifest> {
		return this.manifest ??= (async () => {
			const manifest = await (await rpc.v1.beatmap.catalog.$get()).json();
			// Diffs unranked since the last download must vanish locally too.
			await BeatmapStore.pruneToManifest(manifest).catch(console.error);
			return manifest;
		})().catch(err => {
			// don't cache a failed fetch - the next call retries
			this.manifest = undefined;
			throw err;
		});
	}

	/** Whether a difficulty is in the catalog as loved: it gives no pp. */
	public static async isLoved(beatmapId: number): Promise<boolean> {
		const manifest = await this.getManifest().catch(() => undefined);
		return !!manifest?.beatmaps.some(s => s.loved && s.versions.some(v => v.id === beatmapId));
	}

	/** `bulk`: one of many in a row, which the server sends rate-capped. A set already
	 *  stored with every listed difficulty is kept, unless `update`. */
	public static async downloadOsz(
		metadata: Metadata,
		onProgress?: (progress: number) => void,
		bulk = false,
		update = false,
	): Promise<SetRecord> {
		const existing = await BeatmapStore.getSet(metadata.id);
		if (existing && !update && metadata.versions.every(v => v.id in existing.osu)) return existing;

		const release = await downloadSlot();
		let buf: Uint8Array;
		try {
			const url = `${BASE_URL}/v1/beatmap/osz/${metadata.id}${bulk ? '?bulk' : ''}`;
			// signed in: the day's full-speed downloads are counted on the account;
			// a set changes on the server, and older builds of it may sit in the HTTP cache
			const init = withAuth({ cache: 'no-store' });
			let res = await API.fetch(url, init);
			// over the server's 10 downloads per address (another device or tab)
			while (res.status === 429) {
				await sleep(2_000);
				res = await API.fetch(url, init);
			}
			if (!res.ok) throw new Error(`Download of set ${metadata.id} failed: ${res.status}`);
			buf = await this.readWithProgress(res, onProgress);
		} finally {
			release();
		}
		const files = await new Promise<Unzipped>((resolve, reject) => {
			unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
		});

		return await BeatmapStore.storeOsz(metadata, files, !!existing);
	}

	/** A downloadable set: from the ranked catalog, or a player's unranked upload. */
	public static async setMetadata(id: number): Promise<Metadata | undefined> {
		const manifest = await this.getManifest();
		const listed = [manifest.intro, ...manifest.beatmaps].find(s => s?.id === id);
		if (listed) return listed;
		const res = await rpc.v1.beatmap.unranked[':setId'].$get({ param: { setId: String(id) } });
		return res.ok ? await res.json() : undefined;
	}

	/** Whether the server's chart differs from the stored one. */
	public static async isOutdated(beatmap: LightBeatmap): Promise<boolean> {
		const id = beatmap.metadata.id;
		if (!beatmap.metadata.runtime || id < 0 || !crypto.subtle) return false;
		const [res, text] = await Promise.all([
			rpc.v1.beatmap.checksum[':id'].$get({ param: { id: String(id) } }),
			BeatmapStore.getOsu(beatmap.set.metadata.id, id),
		]);
		if (!res.ok || text === undefined) return false;
		const bytes = new TextEncoder().encode(text.replace(/^\uFEFF/, ''));
		const digest = await crypto.subtle.digest('SHA-256', bytes);
		const checksum = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
		return checksum !== (await res.json()).checksum;
	}

	/** Download a stored set again, as the server has it now. */
	public static async update(setId: number): Promise<void> {
		const metadata = await this.setMetadata(setId);
		if (!metadata) throw new Error(`Set ${setId} is not available`);
		await this.downloadOsz(metadata, undefined, false, true);
	}

	/**
	 * Read a response body into a single buffer, reporting download progress
	 * (0..1) against Content-Length. Falls back to a plain arrayBuffer read when
	 * no callback is given or the body can't be streamed (e.g. length unknown).
	 */
	private static async readWithProgress(
		res: Response,
		onProgress?: (progress: number) => void,
	): Promise<Uint8Array> {
		const total = Number(res.headers.get('content-length')) || 0;
		if (!onProgress || !res.body || !total) {
			return new Uint8Array(await res.arrayBuffer());
		}

		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let loaded = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			loaded += value.length;
			onProgress(loaded / total);
		}
		onProgress(1);

		const out = new Uint8Array(loaded);
		let offset = 0;
		for (const chunk of chunks) {
			out.set(chunk, offset);
			offset += chunk.length;
		}
		return out;
	}

	public static async isDownloaded(metadata: Metadata): Promise<boolean> {
		return BeatmapStore.has(metadata.id);
	}

}

Socket.on('catalog:invalidate', () => BeatmapAPI.invalidate());

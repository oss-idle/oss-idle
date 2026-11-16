import {
	findFrames,
	findSound,
	type FoundImage,
	normalizePath,
	type SkinIndex,
} from '@oss-idle/shared/osuSkin/files';
import {
	emptyIdleIni,
	type IdleIni,
	parseIdleIni,
} from '@oss-idle/shared/osuSkin/idleIni';
import {
	decodeIni,
	emptyIni,
	parseSkinIni,
	type SkinIni,
} from '@oss-idle/shared/osuSkin/ini';

/** Bigger images cost memory and GPU uploads for nothing a screen can show. */
const MAX_SIDE = 4096;

export type Fit = 'scale' | 'top';

/** A decoded image and its size as the file has it (the bitmap may be smaller). */
export type Decoded = { img: ImageBitmap, w: number, h: number };

/** The image copied onto the GPU: drawn from a decoded file's bitmap, a skin's images cost
 *  milliseconds every frame even on a fast GPU. */
export const resident = (img: ImageBitmap): ImageBitmap => {
	const canvas = new OffscreenCanvas(img.width, img.height);
	canvas.getContext('2d')!.drawImage(img, 0, 0);
	img.close();
	return canvas.transferToImageBitmap();
};

const decode = async (blob: Blob, fit: Fit): Promise<Decoded> => {
	const decoded = await decodeFile(blob, fit);
	return {
		...decoded, img: resident(decoded.img),
	};
};

const decodeFile = async (blob: Blob, fit: Fit): Promise<Decoded> => {
	const img = await createImageBitmap(blob);
	const { width: w, height: h } = img;
	if (w <= MAX_SIDE && h <= MAX_SIDE) return {
		img, w, h,
	};
	if (fit === 'top' && w <= MAX_SIDE) {
		const top = await createImageBitmap(img, 0, 0, w, MAX_SIDE);
		img.close();
		return {
			img: top, w, h: MAX_SIDE,
		};
	}
	const k = MAX_SIDE / Math.max(w, h);
	const small = await createImageBitmap(img, {
		resizeWidth: Math.max(1, Math.round(w * k)),
		resizeHeight: Math.max(1, Math.round(h * k)),
		resizeQuality: 'high',
	});
	img.close();
	return {
		img: small, w, h,
	};
};

const THUMB_SIDE = 180;

// a few at a time: a folded group opening asks for hundreds at once
let thumbsRunning = 0;
const thumbsWaiting: (() => void)[] = [];
const thumbSlot = async () => {
	if (thumbsRunning >= 4) await new Promise<void>(resolve => thumbsWaiting.push(resolve));
	thumbsRunning++;
};
const thumbDone = () => {
	thumbsRunning--;
	thumbsWaiting.shift()?.();
};

const thumbnail = async (blob: Blob): Promise<Blob> => {
	await thumbSlot();
	try {
		return await shrink(blob);
	} finally {
		thumbDone();
	}
};

const shrink = async (blob: Blob): Promise<Blob> => {
	const img = await createImageBitmap(blob);
	const k = Math.min(1, THUMB_SIDE / Math.max(img.width, img.height));
	if (k === 1) {
		img.close();
		return blob;
	}
	const w = Math.max(1, Math.round(img.width * k));
	const out = new OffscreenCanvas(w, Math.max(1, Math.round(img.height * k)));
	out.getContext('2d')!.drawImage(img, 0, 0, out.width, out.height);
	img.close();
	return out.convertToBlob();
};

const PROBE_WIDTH = 256;
const TRIMMED_MAX = 512;

/** Where a row or column of `alpha` (width × height) is covered enough to count: a thin
 *  line or a faint glow across the image is not what it shows. */
export const coveredSpan = (
	alpha: Uint8ClampedArray, width: number, height: number, rows: boolean,
) => {
	const counts = new Array<number>(rows ? height : width).fill(0);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (alpha[(y * width + x) * 4 + 3] >= 32) counts[rows ? y : x]++;
		}
	}
	const enough = Math.max(...counts) * 0.05;
	const first = counts.findIndex(c => c > enough);
	return [first, counts.length - 1 - [...counts].reverse().findIndex(c => c > enough)];
};

/** The part of an image that shows something, at most TRIMMED_MAX high. */
const trim = async (blob: Blob): Promise<Blob> => {
	const probe = await createImageBitmap(blob, { resizeWidth: PROBE_WIDTH });
	const ctx = new OffscreenCanvas(probe.width, probe.height).getContext('2d')!;
	ctx.drawImage(probe, 0, 0);
	const { data, width, height } = ctx.getImageData(0, 0, probe.width, probe.height);
	const [left, right] = coveredSpan(data, width, height, false);
	const [top, bottom] = coveredSpan(data, width, height, true);
	probe.close();
	if (left < 0 || top < 0) return blob;
	const full = await createImageBitmap(blob);
	const k = full.width / width;
	const sx = Math.max(0, (left - 1) * k);
	const sy = Math.max(0, (top - 1) * k);
	const sw = Math.min(full.width - sx, (right - left + 3) * k);
	const sh = Math.min(full.height - sy, (bottom - top + 3) * k);
	const scale = Math.min(1, TRIMMED_MAX / sh);
	const out = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
	out.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);
	full.close();
	return out.convertToBlob();
};

/** Where a skin's files come from: installed (IndexedDB), the catalog, or our own default. */
export type SkinSource = {
	/** normalized paths */
	paths: string[],
	read: (path: string) => Promise<Blob | undefined>,
	/** the paths a map's own files supply, over the player's skin */
	map?: ReadonlySet<string>,
};

/**
 * One osu! skin: its parsed skin.ini and its files, decoded on demand and kept once
 * decoded. Release it with {@link dispose} when it stops being used.
 */
export default class OsuSkin implements SkinIndex {

	private readonly set: Set<string>;
	private readonly bitmaps = new Map<string, Promise<Decoded | undefined>>();
	private readonly urls = new Map<string, Promise<string | undefined>>();

	private constructor(
		readonly source: SkinSource,
		readonly ini: SkinIni,
		/** oss!idle's own settings for it (idle.ini) */
		readonly idle: IdleIni,
	) {
		this.set = new Set(source.paths);
	}

	static async load(source: SkinSource): Promise<OsuSkin> {
		const text = async (name: string) => {
			const blob = await source.read(name);
			return blob && decodeIni(new Uint8Array(await blob.arrayBuffer()));
		};
		const [skin, idle] = await Promise.all([text('skin.ini'), text('idle.ini')]);
		// no skin.ini at all: stable plays it as the latest version
		return new OsuSkin(
			source,
			skin === undefined ? emptyIni() : parseSkinIni(skin),
			idle === undefined ? emptyIdleIni() : parseIdleIni(idle),
		);
	}

	has(path: string): boolean {
		return this.set.has(path);
	}

	/** Whether the file comes from the map being played rather than the player's skin. */
	fromMap(path: string): boolean {
		return this.source.map?.has(normalizePath(path)) ?? false;
	}

	get paths(): string[] {
		return this.source.paths;
	}

	frames(name: string): FoundImage[] {
		return findFrames(this, name);
	}

	sound(name: string): string | undefined {
		return findSound(this, name);
	}

	/** A file decoded as an image; undefined when it is missing or not one. Past
	 *  {@link MAX_SIDE} it is kept smaller: scaled down, or `top` keeps its top rows (a hold
	 *  body, which only ever shows a screen's worth of itself). */
	bitmap(path: string, fit: Fit = 'scale'): Promise<Decoded | undefined> {
		const key = `${fit}:${normalizePath(path)}`;
		let bitmap = this.bitmaps.get(key);
		if (!bitmap) {
			bitmap = this.source.read(normalizePath(path))
				.then(blob => blob && blob.size ? decode(blob, fit) : undefined)
				.catch(() => undefined);
			this.bitmaps.set(key, bitmap);
		}
		return bitmap;
	}

	/** A file as a URL for the page (an <img>, a CSS background). */
	url(path: string): Promise<string | undefined> {
		const key = normalizePath(path);
		let url = this.urls.get(key);
		if (!url) {
			url = this.source.read(key).then(blob => blob && URL.createObjectURL(blob));
			this.urls.set(key, url);
		}
		return url;
	}

	/** An image cut down to what it shows, as a URL: stable's large grades are canvases laid
	 *  out for its results screen, the letter in a corner of mostly nothing. */
	trimmedUrl(path: string): Promise<string | undefined> {
		const key = `trim:${normalizePath(path)}`;
		let url = this.urls.get(key);
		if (!url) {
			url = this.source.read(normalizePath(path))
				.then(blob => blob && trim(blob))
				.then(blob => blob && URL.createObjectURL(blob))
				.catch(() => undefined);
			this.urls.set(key, url);
		}
		return url;
	}

	/** A small copy of an image for a list of files, as a URL: shown at full size, a skin's
	 *  big images would each take tens of megabytes. */
	thumbUrl(path: string): Promise<string | undefined> {
		const key = `thumb:${normalizePath(path)}`;
		let url = this.urls.get(key);
		if (!url) {
			url = this.source.read(normalizePath(path))
				.then(blob => blob && blob.size ? thumbnail(blob) : undefined)
				.then(blob => blob && URL.createObjectURL(blob))
				.catch(() => undefined);
			this.urls.set(key, url);
		}
		return url;
	}

	async bytes(path: string): Promise<ArrayBuffer | undefined> {
		return (await this.source.read(normalizePath(path)))?.arrayBuffer();
	}

	dispose(): void {
		for (const bitmap of this.bitmaps.values()) void bitmap.then(b => b?.img.close());
		for (const url of this.urls.values()) void url.then(u => u && URL.revokeObjectURL(u));
		this.bitmaps.clear();
		this.urls.clear();
	}

}

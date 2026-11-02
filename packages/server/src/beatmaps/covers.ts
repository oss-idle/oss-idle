import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { previewPath } from './storage';

/**
 * Card covers: each background preview baked once to a small JPEG beside it,
 * `<file>.cover.jpg`, which song select stores as is - instead of downloading the
 * full background and shrinking it itself. As wide as the client's own bake.
 */
const WIDTH = 800;

export const COVER_SUFFIX = '.cover.jpg';

/** The cover of a background preview: `123.jpg` → `123.jpg.cover.jpg` (a set can hold
 *  a stale `123.png` beside it). */
export const coverName = (file: string) => file + COVER_SUFFIX;

/** Bake a background preview's cover; false (logged) when ffmpeg can't read it. */
export const bakeCover = async (file: string): Promise<boolean> => {
	try {
		// a player's file: read from disk only, and only as an image, whose data (not
		// its extension, often wrong) says JPEG or PNG
		await promisify(execFile)('ffmpeg', [
			'-y', '-loglevel', 'error', '-protocol_whitelist', 'file',
			'-f', 'image2pipe', '-i', previewPath(file),
			'-vf', `scale='min(${WIDTH},iw)':-2`, '-frames:v', '1', '-q:v', '3',
			previewPath(coverName(file)),
		], { timeout: 30_000 });
		return true;
	} catch (err) {
		console.error(`  ffmpeg failed to bake the cover of ${file}:`, err);
		return false;
	}
};

/** Whether osu! serves covers for a set: an old one can have none (a 404). Unreachable
 *  counts as served. */
export const osuServesCover = (osuId: number) =>
	fetch(`https://assets.ppy.sh/beatmaps/${osuId}/covers/cover.jpg`, {
		method: 'HEAD', signal: AbortSignal.timeout(5000),
	}).then(res => res.status !== 404, () => true);

import {
	mkdir,
	readFile,
	rename,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

/**
 * `.osu` files of maps from osu!, by beatmap id: ranked maps never change, so each is
 * fetched once. Relative to the server's working directory, like uploads.
 */
const DIR = './osu-charts';

/** ponytail: per worker, across every match. A shared pace if osu! ever minds. */
const DOWNLOAD_GAP_MS = 200;
let nextDownload = 0;

const waitForTurn = async () => {
	const at = Math.max(nextDownload, Date.now());
	nextDownload = at + DOWNLOAD_GAP_MS;
	await new Promise(resolve => setTimeout(resolve, at - Date.now()));
};

const fileOf = (beatmapId: number) => join(DIR, `${beatmapId}.osu`);

/** The map's `.osu`, undefined when osu! doesn't have it. */
export const osuChart = async (beatmapId: number): Promise<string | undefined> => {
	const kept = await readFile(fileOf(beatmapId), 'utf8').catch(() => undefined);
	if (kept) return kept;
	await waitForTurn();
	const res = await fetch(`https://osu.ppy.sh/osu/${beatmapId}`, {
		headers: { 'User-Agent': 'oss-idle/1.0' }, signal: AbortSignal.timeout(20_000),
	}).catch(() => undefined);
	if (!res?.ok) return undefined;
	const chart = await res.text();
	if (!chart.startsWith('osu file format') && !chart.includes('[HitObjects]')) return undefined;
	await mkdir(DIR, { recursive: true });
	const aside = `${fileOf(beatmapId)}.${process.pid}.${Date.now()}`;
	await writeFile(aside, chart);
	await rename(aside, fileOf(beatmapId));
	return chart;
};

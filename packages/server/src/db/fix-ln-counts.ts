/**
 * Recount every map's long notes from its stored chart.
 *
 * Ingest read them from rosu's slider count, which is always 0 on a mania
 * chart (its long notes are holds), so no map could unlock the LN medal.
 * Medals re-check every score on each play, so owners get it on their next one.
 *
 *   npm -w @oss-idle/server run fix:ln:prod -- --dry-run
 */
import { eq } from 'drizzle-orm';
import * as rosu from 'rosu-pp-js';

import { playableChart } from '@oss-idle/shared/osu/playableChart';

import { db } from './client';
import { beatmaps } from './schema/beatmap';

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
	const rows = await db.select({
		id: beatmaps.id, chart: beatmaps.chart, ln: beatmaps.ln,
	}).from(beatmaps);
	console.log(`checking ${rows.length} maps${dryRun ? ' (dry run)' : ''}`);

	let fixed = 0;
	for (const row of rows) {
		let ln: number;
		try {
			const map = new rosu.Beatmap(playableChart(row.chart));
			ln = map.nHolds;
			map.free();
		} catch { continue; }
		if (ln === row.ln) continue;
		if (!dryRun) await db.update(beatmaps).set({ ln }).where(eq(beatmaps.id, row.id));
		fixed++;
	}

	console.log(`${fixed} map${fixed === 1 ? '' : 's'} ${dryRun ? 'would be corrected' : 'corrected'}`);
	process.exit(0);
};

void main();

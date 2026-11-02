import 'dotenv/config';

import {
	eq,
	isNotNull,
} from 'drizzle-orm';

import { osuServesCover } from '../beatmaps/covers';
import {
	db,
	pool,
} from './client';
import { beatmapset } from './schema/beatmapset';

/**
 * Asks osu! whether it serves covers for every set from osu! (ingest asks for new ones;
 * sets stored before need this once). Safe to run again.
 *
 *   npm -w @oss-idle/server run check:covers[:prod]
 */
const PARALLEL = 8;

const main = async (): Promise<void> => {
	const sets = await db.select({
		id: beatmapset.id, osuId: beatmapset.osuId, 
	})
		.from(beatmapset).where(isNotNull(beatmapset.osuId));
	const missing: number[] = [];
	const worker = async () => {
		for (let set = sets.pop(); set; set = sets.pop()) {
			const osuCover = await osuServesCover(set.osuId!);
			if (!osuCover) missing.push(set.osuId!);
			await db.update(beatmapset).set({ osuCover }).where(eq(beatmapset.id, set.id));
		}
	};
	await Promise.all(Array.from({ length: PARALLEL }, worker));
	console.log(`✓ ${missing.length} sets without an osu! cover: ${missing.join(', ')}`);
};

main()
	.catch(e => { console.error(e); process.exitCode = 1; })
	.finally(() => pool.end());

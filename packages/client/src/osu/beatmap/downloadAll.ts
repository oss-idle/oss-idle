import Synced from '@oss-idle/shared/helpers/synced';
import {
	type RulesetId,
	rulesetOf,
} from '@oss-idle/shared/rulesets/ids';

import BeatmapAPI, { type Metadata } from './beatmap_api';
import BeatmapStore from './beatmap_store';

/** The "download every bundled / ranked beatmap" run: its progress while it goes. */
export const bulkDownload = new Synced<{ done: number; total: number } | undefined>(undefined);
let stopping = false;

/** The ranked (or only bundled) sets not downloaded yet, with a difficulty of the
 *  ruleset when one is given. Loved ones are never in it. */
export const missingSets = async (bundled: boolean, ruleset?: RulesetId): Promise<Metadata[]> => {
	const manifest = await BeatmapAPI.getManifest();
	const sets = manifest.beatmaps.filter(m => !m.loved && (!bundled || m.bundled)
		&& (!ruleset || m.versions.some(v => rulesetOf(v.mode, v.keys) === ruleset)));
	const stored = await Promise.all(sets.map(m => BeatmapStore.has(m.id)));
	return sets.filter((_, i) => !stored[i]);
};

/** Download the sets one after another; false when stopped before the end. */
export const downloadAll = async (sets: Metadata[]): Promise<boolean> => {
	stopping = false;
	try {
		for (const [done, set] of sets.entries()) {
			if (stopping) return false;
			await bulkDownload.set({
				done, total: sets.length,
			});
			await BeatmapAPI.downloadOsz(set, undefined, true);
		}
		return true;
	} finally {
		void bulkDownload.set(undefined);
	}
};

export const stopDownloadAll = (): void => { stopping = true; };

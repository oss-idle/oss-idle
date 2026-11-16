import { Beatmap } from 'osu-classes';
import * as ppjs from 'rosu-pp-js-web';

import type { Mod } from '@oss-idle/shared/mods';
import { playableChart } from '@oss-idle/shared/osu/playableChart';
import type {
	PerformanceScore,
	RulesetDef,
} from '@oss-idle/shared/rulesets/ruleset';

import BeatmapAPI from './beatmap/beatmap_api';
import BeatmapStore from './beatmap/beatmap_store';
import rosuReady from './rosu';

/** A play's pp, as its ruleset reads it to rosu. */
const calculatePP = async (
	def: RulesetDef,
	score: PerformanceScore,
	beatmap: Beatmap,
	rate = 1,
	mods: readonly Mod[] = [],
): Promise<number> => {
	if (await BeatmapAPI.isLoved(beatmap.metadata.beatmapId)) return 0;
	const osu = await BeatmapStore
		.getOsu(beatmap.metadata.beatmapSetId, beatmap.metadata.beatmapId);
	if (!osu) return 0;

	await rosuReady();
	return new ppjs.Performance(def.performanceArgs(score, rate, mods))
		.calculate(new ppjs.Beatmap(playableChart(osu))).pp;
};

export default calculatePP;
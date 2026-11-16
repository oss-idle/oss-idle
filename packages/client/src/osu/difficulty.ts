import { Beatmap } from 'osu-classes';
import * as ppjs from 'rosu-pp-js-web';

import { playableChart } from '@oss-idle/shared/osu/playableChart';

import BeatmapStore from './beatmap/beatmap_store';
import rosuReady from './rosu';

export { difficultyColor } from '@oss-idle/shared/display/difficulty';

/** A downloaded difficulty's stars at a rate; undefined when its file isn't here. */
export const starsAt = async (
	setId: number, beatmapId: number, rate: number,
): Promise<number | undefined> => {
	const osu = await BeatmapStore.getOsu(setId, beatmapId);
	if (!osu) return undefined;
	await rosuReady();
	return new ppjs.Difficulty({
		lazer: false, clockRate: rate,
	}).calculate(new ppjs.Beatmap(playableChart(osu))).stars;
};

const calculateSR = async (beatmap: Beatmap, rate = 1): Promise<number> => {
	const osu = await BeatmapStore
		.getOsu(beatmap.metadata.beatmapSetId, beatmap.metadata.beatmapId);
	if (!osu) return 0;

	await rosuReady();
	return new ppjs.Difficulty({
		lazer: false, clockRate: rate,
	}).calculate(new ppjs.Beatmap(playableChart(osu))).stars;
};

export default calculateSR;
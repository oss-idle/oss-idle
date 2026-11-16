import { normalizePath } from '@oss-idle/shared/osuSkin/files';

import type { SkinDAO } from '../../db/schema/skin';
import BeatmapStore from '../beatmap/beatmap_store';
import { defaultSource } from './defaultSkin';
import { layered } from './layered';
import OsuSkin, { type SkinSource } from './OsuSkin';
import Skin from './Skin';
import { installedSource } from './sources';

/** What a map's files may skin: the images and sounds a mania play draws from a skin, never
 *  the skin's own settings, nor the map's background, storyboard or hitsounds. */
const SKINNABLE =
	/^(mania-|lighting|comboburst|scorebar-|score-|particle)[^/]*\.(png|jpe?g|wav|ogg|mp3)$/;

const mapSource = async (setId: number): Promise<SkinSource> => {
	const names = new Map((await BeatmapStore.fileNames(setId))
		.map(name => [normalizePath(name), name] as const)
		.filter(([path]) => SKINNABLE.test(path)));
	return {
		paths: [...names.keys()],
		read: async path => {
			const name = names.get(path);
			return name === undefined ? undefined : BeatmapStore.file(setId, name);
		},
	};
};

/**
 * The player's skin (`dao`, or the default one) with a map's own skin files over it, as
 * osu!stable plays a map. Undefined when the set has no skin files.
 */
export const beatmapSkin = async (
	setId: number, dao: SkinDAO | undefined,
): Promise<Skin | undefined> => {
	const map = await mapSource(setId);
	if (!map.paths.length) return undefined;
	const base = (dao && await installedSource(dao.id)) ?? defaultSource();
	return Skin.create(await OsuSkin.load(layered(map, base)));
};

import { uiSound } from '../../audio/uiSounds';
import type LightBeatmap from '../../osu/beatmap/LightBeatmap';

/** osu!'s random: a spin that rises the further it travels, or an error with nothing to land on. */
export const randomSounds = (
	list: LightBeatmap[], from: LightBeatmap | undefined, to: LightBeatmap | undefined,
) => {
	if (!to) {
		uiSound('ui/generic-error');
		return;
	}
	const at = (map?: LightBeatmap) => list.findIndex(b => b.is(map));
	const travelled = Math.abs(at(to) - Math.max(0, at(from)));
	uiSound('songselect/random-spin', { pitch: 1 + Math.min(1, Math.max(0, travelled / 200)) });
	uiSound('songselect/select-random');
};

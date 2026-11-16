import { useEffect } from 'react';

import { showSelected } from '../../addons/state';
import type LightBeatmap from '../../osu/beatmap/LightBeatmap';
import type { DownloadState } from '../BeatmapCarousel';

/** Tells add-ons which difficulty song select is on, while `shown`. */
export default function useShownSelection(
	shown: boolean,
	beatmap: LightBeatmap | undefined,
	downloads: Record<number, DownloadState>,
): void {
	const downloading = !!beatmap && downloads[beatmap.set.metadata.id]?.status === 'downloading';
	useEffect(() => {
		if (shown) showSelected(beatmap, downloading);
	}, [shown, beatmap, downloading]);
	useEffect(() => () => {
		if (shown) showSelected(undefined, false);
	}, [shown]);
}

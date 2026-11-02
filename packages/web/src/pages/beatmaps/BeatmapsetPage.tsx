import './BeatmapsetPage.css';

import type { Mapset } from '../../api/maps';
import BeatmapsetHeader from './BeatmapsetHeader';
import MapScoreboard, { type Board } from './MapScoreboard';

/** A beatmap set, after osu!'s: the header with its difficulties, then the picked one's scores. */
export default function BeatmapsetPage({ mapset, diffId, board }: {
	mapset: Mapset;
	diffId: number | undefined;
	board: Board;
}) {
	// like osu!, the hardest difficulty unless one is picked
	const diff = mapset.diffs.find(d => d.id === diffId) ?? mapset.diffs[mapset.diffs.length - 1];
	return <main className='mapset'>
		<BeatmapsetHeader key={mapset.set.id} mapset={mapset} diff={diff} />
		<MapScoreboard
			setId={mapset.set.id} beatmapId={diff.id} board={board} loved={mapset.set.status === 'loved'}
		/>
	</main>;
}

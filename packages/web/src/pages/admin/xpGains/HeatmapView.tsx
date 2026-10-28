import BandGrid from './BandGrid';
import {
	extentOf,
	perPlay,
	type XpBands,
} from './bands';
import {
	compact,
	inkOn,
	sequential,
} from './scales';

/** Every skill's raw XP per play by band, darker is less, on one log scale for all. */
export default function HeatmapView({ data }: { data: XpBands }) {
	const [lo, hi] = extentOf(data);
	return <>
		<p className='xp-gains__lede'>
			XP per play, one log scale for every cell. Hatched cells have under 20 plays.
		</p>
		<BandGrid data={data} look={(band, skill) => {
			const avg = perPlay(band, skill);
			if (avg === undefined) return undefined;
			const t = hi > lo ? (Math.log10(Math.max(avg, 10 ** lo)) - lo) / (hi - lo) : 1;
			return {
				background: sequential(t), color: inkOn(t), text: compact(avg),
			};
		}} />
	</>;
}

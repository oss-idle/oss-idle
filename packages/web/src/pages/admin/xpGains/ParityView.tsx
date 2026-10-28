import BandGrid from './BandGrid';
import {
	accuracyOf,
	perPlay,
	type XpBands,
} from './bands';
import {
	compact,
	diverging,
	inkOnRatio,
} from './scales';

const KEYS = [0.25, 0.5, 1, 2, 4];

/** Each skill's raw XP per play as a multiple of accuracy's in the same band. */
export default function ParityView({ data }: { data: XpBands }) {
	const accuracy = accuracyOf(data);
	return <>
		<p className='xp-gains__lede'>
			Each skill against accuracy in the same band: gray pays the same, blue less, red more
			(full colour at a quarter or four times). Accuracy's column is its own XP per play.
		</p>
		<div className='xp-gains__legend'>
			{KEYS.map(k => (
				<span key={k} className='xp-gains__key' style={{
					background: diverging(k), color: inkOnRatio(k),
				}}>×{k}</span>
			))}
		</div>
		<BandGrid data={data} look={(band, skill) => {
			const avg = perPlay(band, skill);
			const acc = perPlay(band, accuracy);
			if (avg === undefined || acc === undefined || (skill !== accuracy && acc === 0)) return undefined;
			if (skill === accuracy) return {
				background: 'transparent', color: 'hsl(var(--hsl-c1))', text: compact(avg),
			};
			const ratio = avg / acc;
			return {
				background: diverging(ratio), color: inkOnRatio(ratio), text: `×${ratio.toFixed(2)}`,
			};
		}} />
	</>;
}

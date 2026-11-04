import '../components/BeatmapCarousel.css';

import type { CSSProperties } from 'react';

import BeatmapCardXP from '../components/BeatmapCardXP';

const SIZES: [top: number, total: number][] = [
	[612, 4_410], [8_450, 61_230], [184_000, 2_100_000], [3_400_000, 1_200_000_000], [740_000_000, 1.6e12],
];

const card = {
	position: 'relative', width: 640, height: 40, margin: '6px 0', background: '#211c28', borderRadius: 8,
	'--bleed': '0px', '--pop': '0px', '--dim': 1,
} as CSSProperties;

/** Song select XP chips at every size. */
export default function BigNumbersChips() {
	return <div style={{ padding: 24 }}>
		{SIZES.map(([top, total], i) => (
			<div key={i} style={card}>
				<BeatmapCardXP insight={{
					beatmapId: i, source: 'history', playedAt: 0, total,
					bySkill: {
						speed: top, stamina: total - top, 
					}, top: {
						skill: 'speed', gained: top, 
					},
				}} />
			</div>
		))}
	</div>;
}

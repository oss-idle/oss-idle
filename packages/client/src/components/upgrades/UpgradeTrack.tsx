import type { CSSProperties } from 'react';

import {
	layerClass as colour,
	layerOf,
} from '@oss-idle/shared/display/layers';
import { BASE_MAX_UPGRADES } from '@oss-idle/shared/upgrades';

export default function UpgradeTrack({
	upgrades,
	max,
	maxed,
	ready,
	progress,
}: {
	upgrades: number,
	max: number,
	maxed: boolean,
	ready: boolean,
	progress: number,
}) {
	const next = upgrades % BASE_MAX_UPGRADES;
	const nextLayer = Math.floor(upgrades / BASE_MAX_UPGRADES) + 1;

	return (
		<div className="ladder-track">
			{Array.from({ length: Math.min(max, BASE_MAX_UPGRADES) }, (_, i) => {
				const isNext = !maxed && i === next;
				return (
					<span key={i} className={`ladder-track__slot ${colour(layerOf(i, upgrades, BASE_MAX_UPGRADES))}`}>
						{isNext && (
							<span
								className={`ladder-track__next ${colour(nextLayer)} ${ready ? 'is-ready' : ''}`}
								style={{ '--fill': ready ? 1 : progress } as CSSProperties}
							/>
						)}
					</span>
				);
			})}
		</div>
	);
}

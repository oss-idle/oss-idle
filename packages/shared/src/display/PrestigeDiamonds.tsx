import {
	layerClass,
	layerOf,
} from './layers.js';

const SIZE = 5;

/** One layer above the gear track's, so the first lap is not upgrade pink. */
const colour = (layer: number) => layerClass(layer > 0 ? layer + 1 : 0);

/** Prestiges taken, five to a lap, each lap a new colour over the last. */
export default function PrestigeDiamonds({ prestige }: { prestige: number }) {
	const next = prestige % SIZE;
	const nextLayer = Math.floor(prestige / SIZE) + 1;

	return (
		<span className="prestige-diamonds">
			{Array.from({ length: SIZE }, (_, i) => (
				<span key={i} className={`prestige-diamonds__slot ${colour(layerOf(i, prestige, SIZE))}`}>
					{i === next && <span className={`prestige-diamonds__next ${colour(nextLayer)}`} />}
				</span>
			))}
		</span>
	);
}

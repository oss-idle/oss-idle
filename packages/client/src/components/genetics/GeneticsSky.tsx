import type {
	Genetics,
	GeneticsDef,
} from '@oss-idle/shared/genetics';

import type { Point } from './geneLayout';
import WheelTree from './WheelTree';

export const SKY_W = 1280, SKY_H = 600;
export const SKY_CENTER: Point = [640, 240];
/** How far the card sits from its gene. */
export const CARD_GAP = 62;
/** places round from the top drawn on each side: the rest are below the sky */
const SHOWN_EACH_SIDE = 2;

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	/** the skill `k` places round from the top */
	at: (k: number) => string,
	selected?: string,
	select: (gene: string) => void,
	turnBy: (by: number) => void,
	/** the top skill's own star was picked */
	star: () => void,
	placed: (at: Record<string, Point>) => void,
};

const PLACES = Array.from({ length: SHOWN_EACH_SIDE * 2 + 1 }, (_, i) => i - SHOWN_EACH_SIDE);

/** The sky: every skill's tree on one wheel, turning to bring a tree to the top.
 *  Each layer drifts with the cursor at its own depth. */
export default function GeneticsSky({
	def, genetics, at, selected, select, turnBy, star, placed,
}: Props) {
	const [cx, cy] = SKY_CENTER;
	return (
		<svg className="genetics__sky" viewBox={`0 0 ${SKY_W} ${SKY_H}`}>
			<defs>
				<radialGradient id="genetics-nebula">
					<stop offset="0" stopColor="#ff3d89" stopOpacity={0.22} />
					<stop offset="1" stopColor="#ff3d89" stopOpacity={0} />
				</radialGradient>
			</defs>
			<g className="genetics__layer genetics__layer--far">
				<circle className="genetics__nebula" cx={cx} cy={cy} r={240} fill="url(#genetics-nebula)" />
			</g>
			<g className="genetics__layer genetics__layer--near">
				{PLACES.map(k => at(k)).map((skill, i) => (
					<WheelTree
						key={skill}
						def={def}
						genetics={genetics}
						skill={skill}
						place={PLACES[i]}
						selected={selected}
						select={select}
						turn={() => turnBy(PLACES[i])}
						star={star}
						placed={placed}
					/>
				))}
			</g>
		</svg>
	);
}

import {
	type Genetics,
	type GeneticsDef,
	pickedSkills,
	strength,
} from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import {
	centerBurst,
	type Point,
} from './geneLayout';
import GeneTree from './GeneTree';
import WheelLabel from './WheelLabel';
import WheelStar from './WheelStar';

/** The wheel: its centre lies below the sky, the shown tree at its top. */
export const WHEEL_R = 1100;
export const WHEEL_CENTER: Point = [640, 240 + WHEEL_R];

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	skill: string,
	/** places round from the shown skill: 0 is the top */
	place: number,
	selected?: string,
	select: (gene: string) => void,
	/** turn the wheel to bring this tree to the top */
	turn: () => void,
	star: () => void,
	placed: (at: Record<string, Point>) => void,
};

/** Where a tree sits on the wheel: rotated round its centre, kept upright, smaller off the top.
 *  Its angle is what moves, so a turn carries it along the wheel's edge. */
const onWheel = (place: number, count: number) => {
	const angle = place * 360 / count;
	const scale = place === 0 ? 1 : 0.6;
	return `rotate(${angle}deg) translateY(${-WHEEL_R}px) rotate(${-angle}deg) scale(${scale})`;
};

/** Points of the top tree as they sit in the sky, the wheel at rest. */
const lifted = (at: Record<string, Point>) =>
	Object.fromEntries(Object.entries(at).map(([id, [x, y]]) => [id, [x, y - WHEEL_R] as const]));

/** One skill's tree on the wheel. Only the top one opens its genes; the others turn the wheel. */
export default function WheelTree({
	def, genetics, skill, place, selected, select, turn, star, placed,
}: Props) {
	const top = place === 0;
	const { r, ...layout } = centerBurst(WHEEL_CENTER, def.genes.filter(g => g.skill === skill));
	const picked = pickedSkills(genetics);
	const power = strength(def, picked, skill);
	const classes = ['wheel-tree', top && 'is-top', !power && 'is-far'].filter(Boolean).join(' ');
	return (
		<g
			className={classes}
			style={{ transform: onWheel(place, def.ring.length) }}
			onMouseEnter={top ? undefined : () => uiSound('ui/default-hover')}
			onClick={top ? undefined : e => {
				e.stopPropagation();
				turn();
			}}
		>
			<g className="wheel-tree__lean">
				<circle className="wheel-tree__hit" cx={WHEEL_CENTER[0]} cy={WHEEL_CENTER[1]} r={top ? 0 : 240} />
				<GeneTree
					def={def}
					genetics={genetics}
					skill={skill}
					layout={layout}
					r={r}
					selected={top ? selected : undefined}
					onPick={top ? select : undefined}
					placed={top ? p => placed(lifted(p)) : undefined}
				/>
				<WheelStar at={WHEEL_CENTER} skill={skill} power={power} top={top} open={star} />
				<WheelLabel at={WHEEL_CENTER} skill={skill} power={power} />
			</g>
		</g>
	);
}

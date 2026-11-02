import { uiSound } from '../../audio/uiSounds';
import GeneLabel from './GeneLabel';
import type { Point } from './geneLayout';
import {
	geneClass,
	geneColors,
	type Label,
} from './geneStyle';
import TierMarks from './TierMarks';

type Props = {
	at: Point,
	r: number,
	name: string,
	tier: number,
	max: number,
	/** its parent is held, so it can be bought */
	open: boolean,
	half: boolean,
	selected: boolean,
	/** its place in the tree: each gene floats on its own beat */
	index: number,
	label: Label,
	/** neighbours only name what they hold */
	quiet?: boolean,
	onPick?: () => void,
};

/** One gene on the sky: tier marks under it, its name beside it. It drifts and lifts under the cursor. */
export default function GeneNode({
	at, r, name, tier, max, open, half, selected, index, label, quiet, onPick,
}: Props) {
	const [x, y] = at;
	const held = tier > 0;
	const strong = held || selected;
	const colors = geneColors({
		tier, max, open, half,
	});
	return (
		<g
			className={geneClass(!!onPick, selected, held && tier === max)}
			style={{ '--i': index } as React.CSSProperties}
			onMouseEnter={onPick && (() => uiSound('ui/default-hover'))}
			onClick={onPick && (e => {
				e.stopPropagation();
				uiSound('ui/default-select');
				onPick();
			})}
		>
			<g className="gene__body">
				{selected && <circle className="gene__ring" cx={x} cy={y} r={r + 9} />}
				{held && tier === max && <circle className="gene__glow" cx={x} cy={y} r={r + 6} />}
				<circle className="gene__hit" cx={x} cy={y} r={r + 10} />
				<circle cx={x} cy={y} r={r} fill={colors.fill} stroke={colors.stroke} strokeWidth={colors.width} />
				{max > 1 && <TierMarks x={x} y={y} r={r} tier={tier} max={max} />}
				{(!quiet || strong) && (
					<GeneLabel at={label} name={name} big={r >= 14} strong={strong} dim={!strong && !open} />
				)}
			</g>
		</g>
	);
}

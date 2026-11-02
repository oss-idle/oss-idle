import { useLingui } from '@lingui/react/macro';

import { selectedDef } from '../../rulesets/registry';
import type { Point } from './geneLayout';

/** A tree's name under it on the wheel, and whether it is out of reach. */
type Props = { at: Point, skill: string, power: number };

export default function WheelLabel({
	at: [x, y], skill, power,
}: Props) {
	const { t } = useLingui();
	return (
		<g className="wheel-tree__label">
			<text x={x} y={y + 280} textAnchor="middle" fontSize={34} fontWeight={200}>
				{selectedDef().skillName(skill)}
			</text>
			{!power && (
				<text x={x} y={y + 312} textAnchor="middle" fontSize={20} className="genetics__dim">
					{t`out of reach`}
				</text>
			)}
		</g>
	);
}

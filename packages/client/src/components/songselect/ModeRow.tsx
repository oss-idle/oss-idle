import type { ReactNode } from 'react';

import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

type Variant = { id: RulesetId, label?: string, locked: boolean };

const lockedClass = (v: Variant) => v.locked ? ' is-locked' : '';

/** One mode of the mode menu: picked at once, or, with several variants, split into
 *  them while hovered. */
export default function ModeRow({ icon, name, variants, current, onPick }: {
	icon: ReactNode,
	name: string,
	variants: Variant[],
	current: RulesetId,
	onPick: (id: RulesetId) => void,
}) {
	const isCurrent = variants.some(v => v.id === current);
	const className = `mode-select__row${isCurrent ? ' is-current' : ''}`;
	const [only] = variants;
	if (variants.length === 1) {
		return (
			<button type="button" className={className + lockedClass(only)} onClick={() => onPick(only.id)}>
				{icon}
				<span className="mode-select__name">{name}</span>
			</button>
		);
	}
	return (
		<div className={`${className} has-variants${variants.every(v => v.locked) ? ' is-locked' : ''}`}>
			{icon}
			<span className="mode-select__name">{name}</span>
			<div className="mode-select__variants">
				{variants.map(v => (
					<button
						key={v.id}
						type="button"
						className={`mode-select__variant${v.id === current ? ' is-current' : ''}${lockedClass(v)}`}
						onClick={() => onPick(v.id)}
					>
						{v.label}
					</button>
				))}
			</div>
		</div>
	);
}

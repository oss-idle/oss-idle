import { useLingui } from '@lingui/react/macro';

import { rateLabel } from '@oss-idle/shared/rate';

/** Under a lit rate mod: one step at a time along its side, as far as is unlocked. */
export default function RateStepper({ steps, unlocked, current, onPick }: {
	/** the side's rates, from x1 outwards */
	steps: number[],
	unlocked: number[],
	current: number,
	onPick: (rate: number) => void,
}) {
	const { t } = useLingui();
	const at = steps.indexOf(current);
	const inner = steps[at - 1];
	const outer = steps[at + 1];
	const outerOpen = outer !== undefined && unlocked.includes(outer);
	const slower = steps[0] < 1;
	const inwards = (
		<button
			type="button"
			className="rate-stepper__arrow"
			disabled={inner === undefined}
			onClick={() => onPick(inner!)}
		>{slower ? '›' : '‹'}</button>
	);
	const outwards = (
		<button
			type="button"
			className="rate-stepper__arrow"
			disabled={!outerOpen}
			title={outer !== undefined && !outerOpen
				? t`Each Speed upgrade or prestige unlocks one more step`
				: undefined}
			onClick={() => onPick(outer!)}
		>{slower ? '‹' : '›'}</button>
	);
	// lower rates always on the left
	return (
		<div className="rate-stepper">
			{slower ? outwards : inwards}
			<span className="rate-stepper__value">{rateLabel(current)}</span>
			{slower ? inwards : outwards}
		</div>
	);
}

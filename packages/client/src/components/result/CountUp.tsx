import useSmoothNumber from '../../animations/useSmoothNumber';

/**
 * how long the score / judgement counts take to tick up to their final value
 */
export const COUNT_UP_MS = 1000;

/** A whole number that ticks up from 0 to `value` on mount. */
export default function CountUp({ value }: { value: number }) {
	const shown = useSmoothNumber(value, {
		duration: COUNT_UP_MS, from: 0, 
	});
	return <>{Math.round(shown)}</>;
}

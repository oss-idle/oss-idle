type Props = {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
	/** a line under the knob */
	hint?: string;
};

/** Debug-only: a number to drag, step or type, sized for the game's cursor. */
export default function DebugKnob({ label, value, min, max, onChange, hint }: Props) {
	const set = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next))));

	const knob = (
		<div className="strain__knob">
			<span className="strain__knob-label">{label}</span>
			<button onClick={() => set(value - 1)} aria-label={`${label} down`}>−</button>
			<input
				className="strain__range"
				type="range"
				min={min}
				max={max}
				value={value}
				onChange={e => set(Number(e.target.value))}
			/>
			<button onClick={() => set(value + 1)} aria-label={`${label} up`}>+</button>
			<input
				className="strain__number"
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={e => set(Number(e.target.value) || 0)}
			/>
		</div>
	);
	if (!hint) return knob;
	return (
		<div>
			{knob}
			<div className="strain__hint">{hint}</div>
		</div>
	);
}

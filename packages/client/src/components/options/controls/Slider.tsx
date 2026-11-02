import './Slider.css';

import { ReactNode } from 'react';

import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { notchTick } from '../../../audio/uiSounds';
import { isChanged } from '../../../db/settings';

interface Props {
	/** Backing value. Pass a shared `Synced` so the slider stays subscribable. */
	value: Synced<number>;
	label: ReactNode;
	min?: number;
	max?: number;
	step?: number;
	/** Render the live value (defaults to a whole-number percentage of max). */
	format?: (value: number) => string;
}

/**
 * osu!-style settings slider: a labelled row with the value bubble on the right
 * and a filled track below. Backed by a `Synced<number>` so the value is
 * subscribable outside the panel (volumes feed the audio players this way).
 */
export default function Slider({ 
	value, 
	label, 
	min = 0,
	max = 1, 
	step = 0.01,
	format, 
}: Props) {
	const [current] = useSynced(value);
	const pct = max === min ? 0 : ((current - min) / (max - min)) * 100;
	const shown = format ? 
		format(current) : 
		`${Math.round((current / max) * 100)}%`
	;

	return (
		<label className={`opt-slider ${isChanged(value, current) ? 'is-changed' : ''}`}>
			<div className="opt-slider__head">
				<span className="opt-slider__label">{label}</span>
				<span className="opt-slider__value">{shown}</span>
			</div>
			<input
				className="opt-slider__input"
				type="range"
				min={min}
				max={max}
				step={step}
				value={current}
				style={{ '--fill': `${pct}%` } as React.CSSProperties}
				data-sound="default"
				onChange={(e) => {
					const next = Number(e.target.value);
					if (next !== current) notchTick(max === min ? 0 : (next - min) / (max - min));
					void value.set(next);
				}}
			/>
		</label>
	);
}

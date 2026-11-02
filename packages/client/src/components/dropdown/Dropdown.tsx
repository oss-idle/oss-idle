import './Dropdown.css';

import {
	ReactNode,
	useEffect,
	useRef,
	useState,
} from 'react';

import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { uiSound } from '../../audio/uiSounds';
import { isChanged } from '../../db/settings';

export interface DropdownOption<T> {
	value: T;
	label: ReactNode;
	disabled?: boolean;
}

interface DropdownProps<T> {
	/** The selected value. Pass a shared `Synced` so any component can
	 *  `.sync()` / `useSynced` it to react to the selection. */
	value: Synced<T>;
	options: DropdownOption<T>[];
	/** Tint for the selected border + hover background (any CSS colour). */
	accent?: string;
	className?: string;
}

/**
 * osu!stable-style dropdown: black background, white text, a single accent tint
 * for the selected border and hover/selected background.
 * Backed by a `Synced<T>` so the current selection is subscribable
 * outside this component.
 */
export default function Dropdown<T>({ 
	value, 
	options, 
	accent, 
	className, 
}: DropdownProps<T>) {
	const [selected] = useSynced(value);
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const opened = useRef(false);

	useEffect(() => {
		if (open) uiSound('ui/dropdown-open');
		else if (opened.current) uiSound('ui/dropdown-close');
		opened.current = open;
	}, [open]);

	// close on click/focus anywhere outside the dropdown
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener('mousedown', onDown);
		return () => window.removeEventListener('mousedown', onDown);
	}, [open]);

	const current = options.find((o) => o.value === selected);
	const changed = isChanged(value, selected) ? 'is-changed' : '';
	const style = accent ? ({ 
		'--dropdown-accent': accent, 
		'--dropdown-border': accent,
	} as React.CSSProperties) : undefined;

	return (
		<div
			ref={root}
			className={`dropdown ${open ? 'is-open' : ''} ${changed} ${className ?? ''}`}
			style={style}
		>
			<button 
				type="button"
				className="dropdown__current" 
				onClick={() => setOpen((o) => !o)}
			>
				<span className="dropdown__label">{current?.label}</span>
				<span className="dropdown__caret" aria-hidden />
			</button>
			<div className="dropdown__options" role="listbox">
				{options.map((o, i) => (
					<button
						type="button"
						key={i}
						role="option"
						data-sound="hover"
						aria-selected={o.value === selected}
						className={`dropdown__option ${o.value === selected ? 'is-selected' : ''}`}
						disabled={o.disabled}
						onClick={() => {
							void value.set(o.value);
							setOpen(false);
						}}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

import { useLingui } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import DockQueueButton from './DockQueueButton';
import DockTransport from './DockTransport';
import DockUpgradesButton from './DockUpgradesButton';
import DockUpNext from './DockUpNext';

type Props = {
	/** the scene under it has a bottom bar to stay clear of */
	aboveBar?: boolean;
};

/**
 * The dock while gameplay is up: what plays next and when, and the controls a
 * playing screen needs. It never expands, and it is a fixed size, so nothing
 * in it moves when the next map changes. On a phone in portrait it would cover
 * the receptors, so it waits off the right edge until tapped (dock.css).
 */
export default function DockPill({ aboveBar = false }: Props) {
	const { t } = useLingui();
	const ref = useRef<HTMLDivElement>(null);
	const [out, setOut] = useState(false);

	useEffect(() => {
		if (!out) return;
		const tuck = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOut(false);
		};
		document.addEventListener('pointerdown', tuck);
		return () => document.removeEventListener('pointerdown', tuck);
	}, [out]);

	return (
		<div
			ref={ref}
			className={`dock dock--pill ${aboveBar ? 'dock--above-bar' : ''} ${out ? '' : 'dock--tucked'}`}
		>
			<DockUpNext />
			<div className="dock__bar">
				<DockTransport compact />
				<DockUpgradesButton />
				<DockQueueButton />
			</div>
			{!out && (
				<button
					type="button"
					className="dock__untuck"
					aria-label={t`Show the dock`}
					onClick={() => setOut(true)}
				/>
			)}
		</div>
	);
}

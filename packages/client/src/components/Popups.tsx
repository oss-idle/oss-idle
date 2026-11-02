import './Popups.css';

import {
	useCallback,
	useEffect,
	useState,
} from 'react';

import type {
	Popup,
	PopupType,
} from '@oss-idle/shared/helpers/log';
import Log from '@oss-idle/shared/helpers/log';

import {
	type UiSound,
	uiSound,
} from '../audio/uiSounds';

// how long a popup lingers before it starts sliding away
/** chat popups bring their own sound: the mention ping, or a message's */
const SOUNDS: Partial<Record<PopupType, UiSound>> = {
	good: 'ui/notification-done',
	bad: 'ui/notification-error',
	neutral: 'ui/notification-default',
};

const HOLD_MS = 4000;
const ERROR_HOLD_MD = 30000;
// must match the exit transition in Popups.css
const EXIT_MS = 280;

interface ActivePopup extends Popup {
	leaving: boolean;
}

/** Global overlay: osu!-style toast popups in the bottom-right corner. */
export default function Popups() {
	const [popups, setPopups] = useState<ActivePopup[]>([]);

	// mark as leaving (triggers the slide-out), then drop once the exit finishes
	const dismiss = useCallback((id: number) => {
		setPopups((cur) => cur.map((p) => (p.id === id ? {
			...p, leaving: true, 
		} : p)));
		setTimeout(() => setPopups((cur) => cur.filter((p) => p.id !== id)), EXIT_MS);
	}, []);

	useEffect(() => {
		return Log.listeners.popup.on((popup) => {
			const sound = SOUNDS[popup.type];
			if (sound) uiSound(sound);
			setPopups((cur) => [...cur, {
				...popup, leaving: false, 
			}]);
			if (!popup.sticky) 
				setTimeout(() => 
					dismiss(popup.id)
				, popup.type === 'bad' ? ERROR_HOLD_MD : HOLD_MS);
		});
	}, [dismiss]);

	return (
		<div className="popups">
			{popups.map((p) => (
				<div
					key={p.id}
					className={`popup ${p.type}`}
					data-leaving={p.leaving}
					onClick={() => { p.onClick?.(); dismiss(p.id); }}
				>
					{p.message}
				</div>
			))}
		</div>
	);
}

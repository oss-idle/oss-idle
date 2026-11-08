import './ContextMenu.css';

import {
	type RefObject,
	useEffect,
} from 'react';

import { uiSound } from '../audio/uiSounds';
import { inTextBox } from '../input/Controls';
import useKeyboardOwner from '../input/keyboardOwner';

export interface ContextMenuOption {
	label: string;
	/** the bar's accent colour (osu!-style full-width coloured buttons) */
	color: string;
	onClick: () => void;
}

type Props = {
	title?: string;
	sub?: string;
	/** shown top-left in place of the title, e.g. a player's card */
	header?: React.ReactNode;
	options: ContextMenuOption[];
	/** clicking outside the buttons cancels, same as the gray Cancel option */
	onClose: () => void;
	/** osu!'s "1. Abort", "2. Cancel" is the default: the number is added here, never
	 *  translated, and its key picks the option. Off for menus that confirm something risky. */
	unnumbered?: boolean;
	/** between the header and the buttons, e.g. a list to pick from */
	children?: React.ReactNode;
	/** the box typing goes to while the menu is up */
	focus?: RefObject<HTMLInputElement | null>;
};

/**
 * osu!-style contextual menu: a fullscreen dim overlay with a vertical stack of
 * full-width coloured buttons centred on the screen. Purely presentational -
 * the caller owns what the options do (and must close the menu itself).
 */
export default function ContextMenu({
	title, sub, header, options, onClose, unnumbered, children, focus,
}: Props) {
	const numbered = !unnumbered;
	useKeyboardOwner(focus, { close: onClose });
	useEffect(() => {
		uiSound('ui/menu-open-select');
		return () => { uiSound('ui/menu-close'); };
	}, []);
	useEffect(() => {
		if (!numbered) return;
		const onKey = (e: KeyboardEvent) => {
			if (inTextBox(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
			const option = options[Number(e.key) - 1];
			if (!/^[1-9]$/.test(e.key) || !option) return;
			e.preventDefault();
			e.stopPropagation();
			option.onClick();
		};
		window.addEventListener('keydown', onKey, { capture: true });
		return () => window.removeEventListener('keydown', onKey, { capture: true });
	}, [numbered, options]);
	return (
		<div className="ctxmenu" onClick={onClose}>
			<div className="ctxmenu__header">
				{header ?? <>
					<div className="ctxmenu__title">{title}</div>
					{sub && <div className="ctxmenu__sub">{sub}</div>}
				</>}
			</div>
			{children}
			<div className="ctxmenu__options">
				{options.map((o, i) => (
					<button
						key={o.label}
						type="button"
						className="ctxmenu__option"
						style={{ '--accent': o.color } as React.CSSProperties}
						onClick={(e) => { e.stopPropagation(); o.onClick(); }}
					>
						{numbered ? `${i + 1}. ${o.label}` : o.label}
					</button>
				))}
			</div>
		</div>
	);
}

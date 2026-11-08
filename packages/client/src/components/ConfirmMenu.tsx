import { useLingui } from '@lingui/react/macro';

import ContextMenu from './ContextMenu';

export type Confirm = {
	title: string,
	sub?: string,
	confirmLabel: string,
	/** Accent of the confirm button; defaults to osu! red. */
	color?: string,
	onConfirm: () => void,
};

/** osu!-style confirm overlay (the same one the desktop Exit uses). */
export default function ConfirmMenu({ 
	title,
	sub, 
	confirmLabel, 
	color = '#e93100', 
	onConfirm, 
	onClose, 
}: Confirm & { onClose: () => void }) {
	const { t } = useLingui();
	return (
		<ContextMenu
			unnumbered
			title={title}
			sub={sub}
			onClose={onClose}
			options={[
				{
					label: confirmLabel, color, onClick: () => { onConfirm(); onClose(); }, 
				},
				{
					label: t`Cancel`, color: '#6b6b6b', onClick: onClose, 
				},
			]}
		/>
	);
}

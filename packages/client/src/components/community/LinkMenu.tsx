import { useLingui } from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { copyText } from '../../clipboard';
import ContextMenu from '../ContextMenu';
import { linkFor } from './state';

/** Asks before leaving the game for an address a player posted in chat. */
export default function LinkMenu() {
	const { t } = useLingui();
	const [url] = useSynced(linkFor);
	if (!url) return null;

	const close = () => void linkFor.set(undefined);
	return (
		<ContextMenu
			unnumbered
			title={t`Open this link?`}
			sub={url}
			onClose={close}
			options={[
				{
					label: t`Open link`,
					color: '#2f5f9a',
					onClick: () => {
						close();
						// always a new tab, which the desktop app hands to the system
						// browser: a page loaded in the game's own window could read the session
						window.open(url, '_blank', 'noopener,noreferrer');
					},
				},
				{
					label: t`Copy link`,
					color: '#7d5cc6',
					onClick: () => {
						close();
						copyText(url);
					},
				},
				{
					label: t`Cancel`,
					color: '#9a9a9a',
					onClick: close,
				},
			]}
		/>
	);
}

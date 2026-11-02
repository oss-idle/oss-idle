import './DesktopUpdate.css';

import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
	type ReactNode,
	useEffect,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { STAGING } from '../dev/devTools';
import {
	checkForDesktopUpdate,
	downloadDesktopUpdate,
	updateStatus,
} from '../online/desktopUpdate';
import { PBE } from '../pbe/pbe';

const FEED_CHECK_MS = 30_000;

/**
 * Desktop-only banner that surfaces an available app update and walks
 * the player through it: download, then restart into the new version.
 *
 * Mounted once from App  renders nothing in the browser
 * (the status never leaves `idle` there) or while there's nothing to act on.
 */
export default function DesktopUpdate() {
	const [status] = useSynced(updateStatus);
	const [dismissed, setDismissed] = useState(false);

	// a fresh availability / readiness / error re-opens the banner after a dismiss
	useEffect(() => { setDismissed(false); }, [status.state]);

	// a staging or PBE build comes out with no version bump to announce it: the menu asks
	useEffect(() => {
		if (!STAGING && !PBE) return;
		const check = () => {
			const { state } = updateStatus.get();
			if (state !== 'available' && state !== 'downloading') void checkForDesktopUpdate();
		};
		check();
		const timer = setInterval(check, FEED_CHECK_MS);
		return () => clearInterval(timer);
	}, []);

	// content + the optional primary action, by state; dismissable states get the
	// close button. Anything else (idle / checking / none) shows no banner.
	let body: ReactNode = null;
	const action: ReactNode = null;
	let onClick = () => {};

	switch (status.state) {
		case 'available':
			body = <span>
				<Trans>A new update is available. Click here to download it !</Trans>
			</span>;
			onClick = downloadDesktopUpdate;
			break;
		case 'downloading':
			body = <>
				<div className="dupdate__bar-fill" style={{ width: `${status.percent}%` }} />
				<span><Trans>Downloading update… {ph({ percent: status.percent })}%</Trans></span>
			</>;
			break;
		case 'error':
			body = <span className="dupdate__error">
				<Trans>Update failed ({ph({ error: status.message })}). Please restart the game.</Trans>
			</span>;
			onClick = checkForDesktopUpdate;
			break;
	}

	if (!body || dismissed) return null;

	return (
		<div className={`dupdate ${status.state}`} onClick={onClick}>
			{body}
			{action}
		</div>
	);
}

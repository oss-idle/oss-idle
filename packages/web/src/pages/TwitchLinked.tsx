import './DesktopDone.css';

import { Trans } from '@lingui/react/macro';

/** Where the Twitch link round-trip lands, in whatever browser it ran in. */
export default function TwitchLinked() {
	return (
		<main className="page-contents desktop-done">
			<h1 className="center"><Trans>Your Twitch account is linked!</Trans></h1>
			<p className="center">
				<Trans>You can close this tab.</Trans>
			</p>
		</main>
	);
}

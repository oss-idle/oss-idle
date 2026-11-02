import { Trans } from '@lingui/react/macro';

import { inGameBrowser } from '../../auth';

/** While a match runs: it doesn't need the page, so the game is one click away. */
export default function BotPlayCta() {
	return <div className='bot-play'>
		{!inGameBrowser() && <a className='bot-button is-main' href='/' target='_blank' rel='noreferrer'>
			<Trans>Play oss!idle while it runs</Trans>
		</a>}
		<span className='bot-play__note'><Trans>You can close this tab and come back later</Trans></span>
	</div>;
}

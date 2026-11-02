import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { botOverall } from '@oss-idle/shared/botMatch';

import BotGraph from './BotGraph';

/** What the example on the invitation shows. */
const EXAMPLE = {
	accuracy: 104.2, release: 92, coordination: 106.6, speed: 97, stamina: 94, jackspeed: 101.4, reading: 103.1,
};

/** The invitation to find a bot, with whatever starts it. */
export default function BotLanding({ children }: { children: ReactNode }) {
	return <div className='bot-main bot-landing'>
		<div className='bot-landing__example'>
			<BotGraph levels={EXAMPLE} overall={botOverall(EXAMPLE)} />
			<div className='bot-landing__caption'><Trans>Example skillset</Trans></div>
		</div>
		<div className='bot-landing__text'>
			<h1 className='bot-landing__title'><Trans>Find your oss!idle skillset</Trans></h1>
			<p className='bot-landing__lead'><Trans>
				A bot tries to match your scores by finding the closest skillset.
			</Trans></p>
			{children}
		</div>
	</div>;
}

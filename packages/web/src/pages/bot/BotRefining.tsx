import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import type { BotMatchLive } from '@oss-idle/shared/botMatch';

import BotLiveStep from './BotLiveStep';

/** Above a first result, while the rest of the player's scores go in or wait their turn. */
export default function BotRefining({ live }: { live?: BotMatchLive }) {
	const { t } = useLingui();
	const labels = live && {
		best: '',
		history: t`Reading your play history: page ${live.done}`,
		rest: t`Trying your other scores: ${live.done} of ${live.total}`,
		final: t`Final run: ${live.done} of ${live.total}`,
	};
	return <div className='bot-refining'>
		<div><Trans>This is from your best scores. Your other scores can still change it.</Trans></div>
		{live && labels
			? <BotLiveStep
				label={labels[live.step]}
				state='now'
				share={live.done / Math.max(1, live.total)}
			/>
			: <div><Trans>Your other scores are waiting their turn.</Trans></div>}
	</div>;
}

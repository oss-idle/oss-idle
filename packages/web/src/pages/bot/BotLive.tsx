import { plural } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import {
	BOT_FIRST_STEPS,
	botLiveLevels,
	type BotMatchLive,
	type BotMatchStep,
	botOverall,
} from '@oss-idle/shared/botMatch';
import { bignum } from '@oss-idle/shared/display/num';

import BotGraph from './BotGraph';
import BotLiveStep from './BotLiveStep';
import BotPlayCta from './BotPlayCta';

/** A running match: each step as it goes, how long is left, and the bot as it looks so far. */
export default function BotLive({ live }: { live: BotMatchLive }) {
	const { t } = useLingui();
	const { step, done, total, plays, secondsLeft } = live;
	const levels = botLiveLevels(live);
	const minutes = Math.ceil(secondsLeft / 60);
	const now = (BOT_FIRST_STEPS as readonly BotMatchStep[]).indexOf(step);
	const labels: Record<(typeof BOT_FIRST_STEPS)[number], string> = {
		best: step === 'best' ? t`Trying your best scores: ${done} of ${total}` : t`Trying your best scores`,
		final: step === 'final' ? t`Final run: ${done} of ${total}` : t`Final run`,
	};
	return <>
		<div className='bot-live'>
			<div className='bot-live__head'>
				<div className='bot-live__eta'>
					{secondsLeft < 60
						? <Trans>Less than a minute left</Trans>
						: plural(minutes, {
							one: 'About # minute left', other: 'About # minutes left', 
						})}
				</div>
				<div className='bot-live__plays'>{t`${bignum(plays)} plays so far`}</div>
				<BotPlayCta />
			</div>
			{BOT_FIRST_STEPS.map((name, i) => <BotLiveStep
				key={name}
				label={labels[name]}
				state={i < now ? 'done' : i === now ? 'now' : 'later'}
				share={done / Math.max(1, total)}
			/>)}
		</div>
		<div className='bot-live__title'><Trans>Your skillset so far</Trans></div>
		<BotGraph
			levels={levels}
			overall={botOverall(levels)}
			rough={step !== 'final'}
			measured={live.levels}
		/>
	</>;
}

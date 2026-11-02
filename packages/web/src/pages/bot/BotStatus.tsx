import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import {
	type MyBotMatch,
	runBotMatch,
} from '../../api/botMatch';
import BotLanding from './BotLanding';
import BotLive from './BotLive';
import BotPlayCta from './BotPlayCta';

/** Everything before a result: the invitation, the wait, what went wrong. */
export default function BotStatus({ match, onChange }: {
	match: MyBotMatch;
	onChange: (match: MyBotMatch) => void;
}) {
	const { t } = useLingui();
	const start = <button
		className='bot-button is-main bot-landing__cta'
		onClick={() => void runBotMatch().then(onChange)}
	>
		<Trans>Find my skillset</Trans>
	</button>;
	if (match.status === 'none') {
		return <BotLanding>{start}</BotLanding>;
	}
	if (match.status === 'failed') {
		return <div className='bot-status'>
			<p>{match.failure === 'too_few_plays'
				? <Trans>You need at least 10 osu!mania 4K scores.</Trans>
				: <Trans>Your bot couldn't play right now. Try again in a moment.</Trans>}</p>
			{start}
		</div>;
	}
	if (match.status === 'queued') {
		const place = match.position ?? 1;
		const minutes = Math.ceil((match.waitSeconds ?? 0) / 60);
		return <div className='bot-status'>
			<p>
				{t`You're number ${place} in the queue.`}
				{minutes > 0 && <> {t`It should start in about ${minutes} min.`}</>}
			</p>
			<BotPlayCta />
		</div>;
	}
	if (match.status === 'running') {
		return match.live
			? <BotLive live={match.live} />
			: <div className='bot-status'><p><Trans>Getting started…</Trans></p><BotPlayCta /></div>;
	}
	return undefined;
}

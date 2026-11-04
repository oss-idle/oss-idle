import { Trans } from '@lingui/react/macro';

import type {
	BotMatchRanks,
	BotMatchResult,
} from '@oss-idle/shared/botMatch';
import num, { bignum } from '@oss-idle/shared/display/num';

import BotScore from './BotScore';

/** Where the bot would stand on the boards, and its best plays. */
export default function BotTopScores({ result, ranks }: {
	result: BotMatchResult;
	ranks?: BotMatchRanks;
}) {
	return <div className='bot-side'>
		{ranks && <div className='bot-side__would'>
			<Trans>
				Would be <b className='is-rank'>#{bignum(ranks.performance)}</b> on oss!idle,
				with <b>{num(result.performance)}pp</b>
			</Trans>
		</div>}
		<div className='bot-side__title'><Trans>Best scores</Trans></div>
		{result.top.map(score => <BotScore key={score.beatmapId} score={score} />)}
	</div>;
}

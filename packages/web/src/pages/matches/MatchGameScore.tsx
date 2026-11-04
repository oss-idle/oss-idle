import { Trans } from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import num, { bignum } from '@oss-idle/shared/display/num';
import { Judgements } from '@oss-idle/shared/rulesets/mania/judgement';

import Grade from '../../components/score/Grade';
import PlayerName from './PlayerName';
import type { HistoryScore } from './types';

/** A player's score in a game: combo, accuracy, score, every judgement, grade. */
export default function MatchGameScore({ score, best }: {
	score: HistoryScore,
	best: boolean,
}) {
	// divine only shows when someone got one, as on the result screen
	const judgements = Judgements.filter(j => j !== 'DIVINE' || score.judgements.DIVINE > 0);
	return (
		<div className='match__score'>
			<div className='match__score-player'>
				{score.player && <PlayerName player={score.player} flag />}
			</div>
			<div className='match__score-stats'>
				<div className='match__score-main'>
					<span className='match__stat'>
						<Trans>combo</Trans> <b className={best ? 'is-best' : ''}>{bignum(score.maxCombo)}</b>
					</span>
					<span className='match__stat'>
						<Trans>accuracy</Trans> <b>{accuracy(score.accuracy)}</b>
					</span>
					<span className='match__stat'>
						<Trans>score</Trans> <b className='match__score-value'>
							{num(score.score)}
						</b>
					</span>
				</div>
				<div className='match__score-judges'>
					{judgements.map(j => <span key={j} className='match__stat'>
						{j.toLowerCase()} <b>{bignum(score.judgements[j])}</b>
					</span>)}
				</div>
			</div>
			<div className='match__score-grade'><Grade grade={score.grade} /></div>
		</div>
	);
}

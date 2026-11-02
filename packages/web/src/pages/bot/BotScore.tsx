import { useLingui } from '@lingui/react/macro';

import type { BotTopScore } from '@oss-idle/shared/botMatch';
import accuracy from '@oss-idle/shared/display/accuracy';
import num from '@oss-idle/shared/display/num';

import Grade from '../../components/score/Grade';
import ScoreMods from '../../components/score/ScoreMods';

/** One of the bot's best plays, on a map of the player's. */
export default function BotScore({ score }: { score: BotTopScore }) {
	const { t } = useLingui();
	return <div className='bot-score'>
		<div
			className='bot-score__cover'
			style={{ backgroundImage: `url('https://assets.ppy.sh/beatmaps/${score.setId}/covers/list.jpg')` }}
		/>
		<Grade grade={score.grade} />
		<div className='bot-score__map'>
			<div className='bot-score__title'>{score.title}</div>
			<div className='bot-score__version'>{score.version}</div>
		</div>
		<div className='bot-score__numbers'>
			<div className='bot-score__pp'>{num(score.pp)}pp</div>
			<div className='bot-score__acc'>
				<ScoreMods mods={score.mods} rate={score.rate} /> {accuracy(score.accuracy)}
			</div>
			<div className='bot-score__real'>{t`you: ${accuracy(score.realAccuracy)}`}</div>
		</div>
	</div>;
}

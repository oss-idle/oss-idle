import type { ReactNode } from 'react';

import type {
	BotMatchRanks,
	BotMatchResult,
} from '@oss-idle/shared/botMatch';
import num from '@oss-idle/shared/display/num';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';

import { Asset } from '../../router';
import BotGraph from './BotGraph';
import BotTopScores from './BotTopScores';

/** A finished match: who it is, the shape with its levels, and what the bot would do. */
export default function BotResult({ result, ranks, children }: {
	result: BotMatchResult;
	ranks?: BotMatchRanks;
	/** the owner's controls */
	children?: ReactNode;
}) {
	return <>
		<div className='bot-head'>
			<div
				className='bot-head__avatar'
				style={{ backgroundImage: `url(${Asset(result.avatarUrl ?? GUEST_AVATAR_URL)})` }}
			/>
			<div className='bot-head__name'>{result.username}</div>
			{result.rank && <div className='bot-head__rank'>
				#{num(result.rank)}{result.pp ? <>, {num(result.pp)}pp</> : undefined}
			</div>}
			{children}
		</div>
		<div className='bot-main'>
			<BotGraph levels={result.levels} overall={result.overall} ranks={ranks} />
			<BotTopScores result={result} ranks={ranks} />
		</div>
	</>;
}

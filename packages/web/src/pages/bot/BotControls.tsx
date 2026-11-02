import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import {
	type MyBotMatch,
	runBotMatch,
} from '../../api/botMatch';
import BotShare from './BotShare';

const HOUR_MS = 60 * 60 * 1000;

/** The owner's way to share, and the next run. */
export default function BotControls({ userId, match, onChange }: {
	userId: number;
	match: MyBotMatch;
	onChange: (match: MyBotMatch) => void;
}) {
	const { t } = useLingui();
	const again = 'runAgainAt' in match && match.runAgainAt
		? Math.ceil((new Date(match.runAgainAt).getTime() - Date.now()) / HOUR_MS)
		: undefined;
	const link = `${location.origin}/web/bot/${userId}`;
	return <div className='bot-controls'>
		<BotShare main link={link} />
		{match.status !== 'refining' && <button
			className='bot-button'
			disabled={again !== undefined}
			onClick={() => void runBotMatch().then(onChange)}
		>
			{again === undefined ? <Trans>Run again</Trans> : t`Run again in ${again}h`}
		</button>}
	</div>;
}

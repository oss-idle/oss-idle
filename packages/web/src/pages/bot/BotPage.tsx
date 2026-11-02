import './BotPage.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import {
	getMyBotMatch,
	type MyBotMatch,
} from '../../api/botMatch';
import { loginAndReturn } from '../../auth';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import BotControls from './BotControls';
import BotLanding from './BotLanding';
import BotRefining from './BotRefining';
import BotResult from './BotResult';
import BotStatus from './BotStatus';

const POLL_MS = 2000;
const REFINING_POLL_MS = 15_000;

/** The signed-in player's own match. */
export default function BotPage() {
	const user = useCurrentUser();
	const [match, setMatch] = useState<MyBotMatch>();
	const waiting = match?.status === 'queued' || match?.status === 'running';
	const refining = match?.status === 'refining';

	useEffect(() => {
		if (!user) return;
		void getMyBotMatch().then(setMatch);
	}, [user]);

	useEffect(() => {
		if (!waiting && !refining) return;
		const timer = setInterval(
			() => void getMyBotMatch().then(setMatch),
			refining ? REFINING_POLL_MS : POLL_MS,
		);
		return () => clearInterval(timer);
	}, [waiting, refining]);

	if (!user) {
		return <div className='bot'>
			<BotLanding>
				<button type='button' className='bot-button is-main bot-landing__cta' onClick={loginAndReturn}>
					<Trans>Sign in with osu!</Trans>
				</button>
			</BotLanding>
		</div>;
	}
	if (!match) return <div className='bot' />;
	return <div className='bot'>
		<BotStatus match={match} onChange={setMatch} />
		{refining && <BotRefining live={match.live} />}
		{match.status !== 'running' && 'result' in match && match.result && <BotResult
			result={match.result}
			ranks={match.ranks}
		>
			{!waiting && <BotControls userId={user.id} match={match} onChange={setMatch} />}
		</BotResult>}
	</div>;
}

import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import {
	Plural,
	Trans,
} from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { SUPPORTER_AWAY_HOURS } from '@oss-idle/shared/queue';

import PlayQueue from '../../gameplay/playQueue';
import Auth from '../../online/auth';
import useAwayHours from '../../scenes/useAwayHours';

/** How long the character plays on once the game is closed, beside the queue's length. */
export default function DockAwayTime() {
	const [user] = useSynced(Auth.user);
	const [queue] = useSynced(PlayQueue.state);
	const hours = useAwayHours();
	if (!user || !queue?.entries.length) return null;
	return (
		<span className={`dock__away ${hours === undefined ? 'is-off' : ''}`}>
			<FontAwesomeIcon icon={faMoon} />
			{hours === undefined ? <Trans>off</Trans> : <Trans>{ph({ hours })}h</Trans>}
			<span className="dock__away-tip">
				{hours === undefined
					? <Trans>Stops when you close the game.</Trans>
					: <Trans>
						Keeps playing for <Plural value={hours} one="# hour" other="# hours" />
						{' '}after you close the game.
					</Trans>}
				{!user.supporter && hours !== undefined && <>
					<br />
					<Trans>{ph({ supporterHours: SUPPORTER_AWAY_HOURS })} hours with oss!supporter.</Trans>
				</>}
			</span>
		</span>
	);
}

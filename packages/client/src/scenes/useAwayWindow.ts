import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	AWAY_HOURS,
	SUPPORTER_AWAY_HOURS,
} from '@oss-idle/shared/queue';

import Auth from '../online/auth';
import { keepPlaying } from '../online/queuePrefs';

/** How long the account's queues play on once the game is closed - none when
 *  signed out or with the option off. */
export default function useAwayWindow(): number | undefined {
	const [user] = useSynced(Auth.user);
	const [keep] = useSynced(keepPlaying);
	if (!user || !keep) return undefined;
	return user.supporter ? SUPPORTER_AWAY_HOURS : AWAY_HOURS;
}

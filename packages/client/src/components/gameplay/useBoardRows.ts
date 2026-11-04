import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { SETTINGS } from '../../db/settings';
import Account from '../../online/account';
import Auth from '../../online/auth';
import {
	type BoardRow,
	boardScores,
	boardTab,
} from '../../online/services/scores';

const NONE: BoardRow[] = [];

/** The map's board on the tab song select had selected, by score (a play climbs it by
 *  score), while `on`. */
export default function useBoardRows(beatmapId: number | undefined, on: boolean): BoardRow[] {
	const [account] = useSynced(Account.character);
	const [user] = useSynced(Auth.user);
	const [selected] = useSynced(SETTINGS.leaderboard);
	const country = account?.country;
	const tab = boardTab(selected, country, user?.supporter);
	return useAsync(async () => on && beatmapId !== undefined
		? await boardScores(beatmapId, tab, 'score', country).catch(() => NONE)
		: NONE, [beatmapId, on, tab, country]) ?? NONE;
}

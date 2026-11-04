import './PersonalBest.css';

import { Trans } from '@lingui/react/macro';

import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { BoardSort } from '@oss-idle/shared/rankings';

import {
	SCORE_TAB,
	type ScoreTab,
} from '../../db/settings';
import Account from '../../online/account';
import {
	type BoardRow,
	getMyBeatmapScore,
} from '../../online/services/scores';
import ScoreEntry from './ScoreEntry';

interface Props {
	beatmapId?: number,
	/** Only Global and Country have one: the rank shown is within the board's. */
	tab: ScoreTab,
	sort: BoardSort,
	/** The signed-in player's country. */
	country?: string,
	/** The board above, once loaded: a best already on it is taken from there. */
	board?: BoardRow[],
}

/**
 * The signed-in player's own best on this beatmap + its rank (global,
 * or within a country), shown below the leaderboard even when it falls
 * outside the top 50.
 * Hidden when signed out or the player has no play here yet.
 */
export default function PersonalBest({
	beatmapId, tab, sort, country: own, board, 
}: Props) {
	const [account] = useSynced(Account.character);
	const ranked = tab === SCORE_TAB.GLOBAL || tab === SCORE_TAB.COUNTRY;
	const country = tab === SCORE_TAB.COUNTRY ? own : undefined;
	const at = board?.findIndex(row => row.score.characterId === account?.id) ?? -1;

	// the board's, not the last one's while this one loads
	const key = `${beatmapId}:${sort}:${country}`;
	const fetched = useAsync(async () => ({
		key,
		best: ranked && account && board && beatmapId !== undefined && at < 0
			? await getMyBeatmapScore(beatmapId, sort, country).catch(() => null)
			: null,
	}), [account, key, board, at]);

	const best = at >= 0 ? {
		score: board![at].score, rank: at + 1,
	} : fetched?.key === key ? fetched.best : null;
	if (!ranked || !account || !best) return null;

	return (
		<div className="lb__pb">
			<div className="lb__pb_label"><Trans>Personal best</Trans></div>
			<ol className="lb__list">
				<ScoreEntry score={best.score} rank={best.rank} pp={sort === 'pp'} />
			</ol>
		</div>
	);
}

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import useAsync from '@oss-idle/shared/hooks/useAsync';

import { getMapBoard } from '../../api/maps';
import Link from '../../components/Link';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import MapScoreTable from './MapScoreTable';
import TopScoreCard from './TopScoreCard';

export type Board = 'global' | 'country' | 'friends';

/** osu!'s scoreboard: global, country or friends, the #1's card, then the table.
 *  A loved map's scores give no pp: no pp column. */
export default function MapScoreboard({ setId, beatmapId, board, loved }: {
	setId: number;
	beatmapId: number;
	board: Board;
	loved: boolean;
}) {
	const { t } = useLingui();
	const me = useCurrentUser();
	const country = board === 'country' ? me?.country : undefined;
	const rows = useAsync(() => getMapBoard(beatmapId, {
		country, friends: board === 'friends',
	}), [beatmapId, board, country]);
	const tabs: { board: Board; label: string }[] = [
		{
			board: 'global', label: t`Global Ranking`,
		},
		{
			board: 'country', label: t`Country Ranking`,
		},
		{
			board: 'friends', label: t`Friend Ranking`,
		},
	];
	const signedOut = board !== 'global' && !me;

	return <section className='mapset__board'>
		<nav className='mapset__tabs'>
			{tabs.map(tab => <Link
				key={tab.board}
				to='/maps/$id'
				params={{ id: String(setId) }}
				search={prev => ({
					...prev, board: tab.board,
				})}
				resetScroll={false}
				className={`mapset__tab ${tab.board === board ? 'active' : ''}`}
			>{tab.label}</Link>)}
		</nav>
		{signedOut && <p className='mapset__empty'><Trans>Sign in to see this ranking.</Trans></p>}
		{!signedOut && !rows && <p className='mapset__empty'><Trans>Loading…</Trans></p>}
		{!signedOut && rows && !rows.length && <p className='mapset__empty'>
			<Trans>No one has set a score on this difficulty yet.</Trans>
		</p>}
		{!signedOut && !!rows?.length && <>
			<TopScoreCard row={rows[0]} loved={loved} />
			<MapScoreTable rows={rows} loved={loved} />
		</>}
	</section>;
}

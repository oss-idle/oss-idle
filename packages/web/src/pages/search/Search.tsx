import './Search.css';
import '../friends/Friends.css';
import {
	useEffect,
	useRef,
	useState,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import { searchPlayers } from '../../api/characters';
import { getAllMaps } from '../../api/maps';
import FriendChip from '../friends/FriendChip';
import MapsetCard from '../../components/MapsetCard';

type Mapset = Awaited<ReturnType<typeof getAllMaps>>[number];

const matches = (mapset: Mapset, words: string[]) => {
	const text = `${mapset.artist} ${mapset.title} ${mapset.creator}`.toLowerCase();
	return words.every(w => text.includes(w));
};

/** Best first: the title holding the whole search, then a ranked map over an unranked one. */
const relevance = (mapset: Mapset, query: string) =>
	(mapset.title.toLowerCase().includes(query) ? 0 : 2) + (mapset.status === 'ranked' ? 0 : 1);

/** A broad query matches the whole catalog; rendering ~500 of them froze the tab. */
const MAX_CARDS = 50;

/** Players by name and maps, ranked or not, by artist, title or mapper. */
export default function Search({ q }: { q: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [text, setText] = useState(q);
	const query = q.trim();
	const players = useAsync(() => query ? searchPlayers(query) : [], [query]);
	const mapsets = useAsync(() => getAllMaps('desc', { status: 'any' }), []);
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const found = words.length
		? mapsets?.filter(m => matches(m, words))
			.sort((a, b) => relevance(a, query.toLowerCase()) - relevance(b, query.toLowerCase()))
		: [];

	// the route write drives the players RPC and the whole result list; waiting for a
	// typing pause keeps each keystroke down to just re-rendering the input
	const routeTimer = useRef<number | undefined>();
	useEffect(() => () => clearTimeout(routeTimer.current), []);

	return (
		<div className='page-contents search'>
			<label className='search__box'>
				<FontAwesomeIcon icon={faMagnifyingGlass} />
				<input
					autoFocus
					value={text}
					placeholder={t`Search players and beatmaps`}
					onChange={e => {
						setText(e.target.value);
						clearTimeout(routeTimer.current);
						routeTimer.current = window.setTimeout(() => {
							void navigate({
								to: '/search', search: { q: e.target.value }, replace: true,
							});
						}, 250);
					}}
				/>
			</label>
			{query && (<>
				<h2><Trans>Players</Trans> <b>{players?.length ?? '…'}</b></h2>
				<div className='friends__list'>
					{players?.map(p => <FriendChip key={p.userId} friend={p} />)}
				</div>
				<h2><Trans>Beatmaps</Trans> <b>{found?.length ?? '…'}</b></h2>
				<div className='list__beatmap-container'>
					{found?.slice(0, MAX_CARDS).map(m => <MapsetCard key={m.id} mapset={m} />)}
				</div>
			</>)}
		</div>
	);
}

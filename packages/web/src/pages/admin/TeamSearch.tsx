import '../search/Search.css';
import './Team.css';

import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	useEffect,
	useState,
} from 'react';

import {
	type Group,
	GROUP_BADGE,
	GROUPS,
} from '@oss-idle/shared/groups';
import useAsync from '@oss-idle/shared/hooks/useAsync';

import { searchPlayers } from '../../api/characters';
import GroupBadge from '../../components/character/GroupBadge';
import Link from '../../components/Link';
import ProfilePicture from '../../components/ProfilePicture';

const SHOWN = 10;

/** Find a player by character name and add them to a group in one click. */
export default function TeamSearch({ busy, onAdd }: {
	busy: boolean;
	onAdd: (group: Group, userId: number) => Promise<void>;
}) {
	const [text, setText] = useState('');
	const [query, setQuery] = useState('');
	// the team changes after an add: search again so the badges follow
	const [version, setVersion] = useState(0);

	useEffect(() => {
		const timer = setTimeout(() => setQuery(text.trim()), 250);
		return () => clearTimeout(timer);
	}, [text]);

	const players = useAsync(() => query ? searchPlayers(query) : [], [query, version]);

	return <section className='team-search'>
		<label className='search__box'>
			<FontAwesomeIcon icon={faMagnifyingGlass} />
			<input
				autoFocus
				value={text}
				onChange={e => setText(e.target.value)}
				placeholder='Search a player to add to the team'
			/>
		</label>
		{query && players && !players.length && <p className='admin-medals__meta'>No player found.</p>}
		{!!players?.length && <ul className='team-search__results'>
			{players.slice(0, SHOWN).map(p => <li key={p.character.id} className='team-member'>
				<ProfilePicture avatarUrl={p.character.avatarUrl} className='team-member__avatar' />
				<Link to='/c/$id' params={{ id: String(p.character.id) }} className='team-member__name'>
					{p.character.name}
				</Link>
				{p.groups.map(g => <GroupBadge key={g} group={g} />)}
				<span className='team-member__actions'>
					{GROUPS.filter(g => !p.groups.includes(g)).map(g => <button
						key={g}
						type='button'
						disabled={busy}
						onClick={() => void onAdd(g, p.userId).then(() => setVersion(v => v + 1))}
					>Add to {GROUP_BADGE[g].short}</button>)}
				</span>
			</li>)}
		</ul>}
	</section>;
}

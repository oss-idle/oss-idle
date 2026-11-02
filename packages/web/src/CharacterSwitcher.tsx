import { useNavigate } from '@tanstack/react-router';
import {
	useEffect,
	useState,
} from 'react';

import type { CharacterDTO } from '@oss-idle/shared/character';
import { levelFromTotalXp } from '@oss-idle/shared/display/levelDisplay';

import {
	getMyCharacters,
	selectMyCharacter,
} from './api/characters';
import ProfilePicture from './components/ProfilePicture';
import {
	refreshCurrentCharacter,
	useCurrentCharacter,
} from './hooks/useCurrentCharacter';

/** The account's characters in the user menu; picking one makes it live and opens its profile. */
export default function CharacterSwitcher() {
	const current = useCurrentCharacter();
	const navigate = useNavigate();
	const [characters, setCharacters] = useState<CharacterDTO[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let active = true;
		getMyCharacters()
			.then(list => { if (active) setCharacters(list); })
			.catch(() => {});
		return () => { active = false; };
	}, []);

	if (characters.length <= 1) return undefined;

	const switchTo = async (id: number) => {
		setBusy(true);
		try {
			await selectMyCharacter(id);
			refreshCurrentCharacter();
			void navigate({
				to: '/c/$id', params: { id: String(id) }, 
			});
		} finally {
			setBusy(false);
		}
	};

	return <div className='usermenu_characters'>
		{characters.map(character => <button
			key={character.id}
			type='button'
			className={`usermenu__link usermenu__character ${character.id === current?.id ? 'is-current' : ''}`}
			disabled={busy || character.id === current?.id}
			onClick={() => void switchTo(character.id)}
		>
			<ProfilePicture avatarUrl={character.avatarUrl} className='usermenu__character-avatar' />
			<span className='usermenu__character-name'>{character.name}</span>
			<span className='usermenu__character-level'>
				{levelFromTotalXp(Object.values(character.skills).reduce((n, s) => n + s.lifetimeXp, 0))}
			</span>
		</button>)}
	</div>;
}

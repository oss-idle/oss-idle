import {
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react';

import type { CharacterDTO } from '@oss-idle/shared/character';

import { getMyCharacter } from '../api/characters';
import { useCurrentUser } from './useCurrentUser';

let revision = 0;
const subscribers = new Set<() => void>();

/** Re-read the character everywhere, e.g. after switching to another one. */
export function refreshCurrentCharacter(): void {
	revision++;
	subscribers.forEach(fn => fn());
}

function subscribe(cb: () => void): () => void {
	subscribers.add(cb);
	return () => { subscribers.delete(cb); };
}

const getRevision = () => revision;

/** The signed-in account's character (null when signed out or not yet
 *  onboarded). Use for self links like "My Profile", where the target is the
 *  user's character id - distinct from the account/user id. */
export function useCurrentCharacter(): CharacterDTO | null {
	const user = useCurrentUser();
	const rev = useSyncExternalStore(subscribe, getRevision, getRevision);
	const [character, setCharacter] = useState<CharacterDTO | null>(null);

	useEffect(() => {
		if (!user) { setCharacter(null); return; }

		let active = true;
		getMyCharacter()
			.then(c => { if (active) setCharacter(c); })
			.catch(() => { if (active) setCharacter(null); });
		return () => { active = false; };
	}, [user, rev]);

	return character;
}

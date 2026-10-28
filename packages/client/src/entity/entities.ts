import Synced from '@oss-idle/shared/helpers/synced';

import Character from '../db/schema/character';

export default class Entities {

	/** Stands in while there is no character to show: the session is still
	 *  resolving, or the player has not chosen local or online play yet. */
	public static placeholder(): Character {
		return new Character({
			id: 0,
			name: 'Loading...',
			local: 1,
		});
	}

	// Placeholder until the session resolves. online/account.ts swaps in the real
	// account character (or guest, once we KNOW we're signed out) after online
	// auth answers - we deliberately do NOT pre-seed guest here, so a play started
	// mid-validation can't be scored as guest. Play start waits on Account.ready().
	public static character = new Synced<Character>(Entities.placeholder());

}

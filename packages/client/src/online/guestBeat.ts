import Entities from '../entity/entities';
import { rpc } from './client';

/** Tells the server a local guest has the game open, for the admin dashboard's guest counts. */

const ID_KEY = 'guest-beat-id';
const EVERY_MS = 2 * 60_000;

const deviceId = () => {
	let id = localStorage.getItem(ID_KEY);
	if (!id) localStorage.setItem(ID_KEY, id = crypto.randomUUID());
	return id;
};

let last = 0;

const beat = () => {
	const character = Entities.character.get();
	// id 0: the boot placeholder, before a real guest exists
	if (!character.isGuest() || !character.id || Date.now() - last < EVERY_MS / 2) return;
	last = Date.now();
	void rpc.v1.stats.guest.$post({ json: { id: deviceId() } }).catch(() => undefined);
};

export const startGuestBeat = () => {
	void Entities.character.sync(beat);
	setInterval(beat, EVERY_MS);
};

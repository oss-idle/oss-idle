import type Synced from '@oss-idle/shared/helpers/synced';
import {
	type Match,
	matchPlayers,
} from '@oss-idle/shared/multiplayer';

import { uiSound } from '../audio/uiSounds';

const players = (match: Match) => new Set(matchPlayers(match).map(p => p.characterId));
const readyCount = (match: Match) => matchPlayers(match).filter(p => p.ready).length;

/** osu!'s sounds for players readying up, readying down, and everyone being ready. */
const readySounds = (before: Match, after: Match) => {
	// a round starting or ending resets everyone's ready, as osu! does off its room screen
	if (before.playing !== after.playing) return;
	const was = readyCount(before), now = readyCount(after);
	if (now > was) {
		uiSound(now === matchPlayers(after).length
			? 'multiplayer/player-ready-all' : 'multiplayer/player-ready');
	} else if (now < was) uiSound('multiplayer/player-unready');
};

/** osu!'s sounds for others joining or leaving the room and the host changing. */
const roomSounds = (before: Match, after: Match) => {
	const was = players(before), now = players(after);
	if ([...now].some(id => !was.has(id))) uiSound('multiplayer/player-joined');
	if ([...was].some(id => !now.has(id))) uiSound('multiplayer/player-left');
	if (after.hostId !== before.hostId) uiSound('multiplayer/host-changed');
	readySounds(before, after);
};

/** The room's sounds, from one state of the room we are in to the next: joining or
 *  leaving it ourselves makes none. */
export const followMatchSounds = (current: Synced<Match | undefined>) => {
	let was: Match | undefined;
	current.forceSync(match => {
		const before = was;
		was = match;
		if (match && before?.id === match.id) roomSounds(before, match);
	});
};

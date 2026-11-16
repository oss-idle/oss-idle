import { modSelectOpen } from '../components/mods/modSelectOpen';
import {
	geneticChoice,
	isCommunityOpen,
	isOptionsOpen,
	isPlayChoiceOpen,
	isWebOpen,
	openPage,
} from '../globals';
import { shownMedals } from '../online/medalWatch';
import PlayManager from '../online/playManager';
import SceneManager, { type Scene } from '../scenes/SceneManager';
import {
	type GameState,
	setState,
	stateHost,
} from './state';

/** A server push moves a play's end by its latency; a skip moves it by more. */
const SAME_END_MS = 250;

/** topmost first, as the keyboard layers stack them */
const OVER_PAGES = [
	[geneticChoice, 'genetic-choice'],
	[isPlayChoiceOpen, 'play-choice'],
	[isWebOpen, 'web'],
	[isOptionsOpen, 'options'],
	[shownMedals, 'medals'],
	[isCommunityOpen, 'community'],
] as const;

const open = (): GameState['open'] =>
	OVER_PAGES.find(([store]) => store.get())?.[1]
	?? openPage.get()?.page
	?? (modSelectOpen.get() ? 'mods' : undefined);

let following = false;

/** Keeps `host.state` on what the game's own stores say. */
export const followGame = (): void => {
	if (following) return;
	following = true;

	SceneManager.current.forceSync(scene => setState('scene', scene.toLowerCase() as Lowercase<Scene>));

	for (const store of [...OVER_PAGES.map(([s]) => s), openPage, modSelectOpen]) {
		store.forceSync(() => setState('open', open()));
	}

	let token: string | undefined;
	PlayManager.live.forceSync((live) => {
		const end = stateHost.current().play?.endsAt ?? 0;
		if (live?.token === token && (!live || Math.abs(live.endsAt - end) < SAME_END_MS)) return;
		token = live?.token;
		setState('play', live && {
			beatmapId: live.beatmap.metadata.id,
			rate: live.rate,
			mods: [...live.mods],
			startedAt: live.startedAt,
			endsAt: live.endsAt,
		});
	});
};

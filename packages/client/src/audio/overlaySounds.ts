import type Synced from '@oss-idle/shared/helpers/synced';

import { modSelectOpen } from '../components/mods/modSelectOpen';
import {
	isCommunityOpen,
	isOptionsOpen,
	isPlayChoiceOpen,
	isWebOpen,
	openPage,
} from '../globals';
import {
	type UiSound,
	uiSound,
	type UiSoundOptions,
} from './uiSounds';

type Pops = { open?: UiSound, close?: UiSound, options?: UiSoundOptions };

/** Sounds `flag` turning truthy or falsy; returns what stops it. */
const watch = <T>(flag: Synced<T>, { open, close, options }: Pops) => () => {
	let was = !!flag.get();
	return flag.forceSync(value => {
		const is = !!value;
		if (is === was) return;
		was = is;
		const sound = is ? open : close;
		if (sound) uiSound(sound, options);
	});
};

/** osu!'s sounds for each kind of panel: settings slide in from the left, the full-screen
 *  pages come in on waves, chat is a big panel, small choices pop. */
const OVERLAYS = [
	watch(isOptionsOpen, {
		open: 'ui/settings-pop-in', close: 'ui/overlay-pop-out', options: { pan: -0.6 },
	}),
	watch(isCommunityOpen, {
		open: 'ui/overlay-big-pop-in', close: 'ui/overlay-big-pop-out', 
	}),
	watch(isWebOpen, {
		open: 'ui/wave-pop-in', close: 'ui/overlay-big-pop-out', 
	}),
	watch(openPage, {
		open: 'ui/wave-pop-in', close: 'ui/overlay-big-pop-out', 
	}),
	watch(isPlayChoiceOpen, {
		open: 'ui/dialog-pop-in', close: 'ui/dialog-pop-out', 
	}),
	watch(modSelectOpen, { close: 'songselect/mod-select-overlay-pop-out' }),
];

/** Open and close sounds for the game's panels. */
export const installOverlaySounds = () => {
	const stops = OVERLAYS.map(start => start());
	return () => stops.forEach(stop => stop());
};

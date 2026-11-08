import { SETTINGS } from '../db/settings';
import {
	audioContext,
	speakers,
} from './audioContext';

/** How fast the sound fades out and back in (s, time constant). */
const FADE = 0.15;

// the in-game browser's frame taking the focus leaves this window, but the game still has it
const away = () => document.hidden || !document.hasFocus();

const apply = () => speakers.gain.setTargetAtTime(
	SETTINGS.muteInBackground.get() && away() ? 0 : 1, audioContext.currentTime, FADE,
);

/** With the option on, every sound of the game fades out while it is in the background. */
export const startBackgroundMute = (): void => {
	// focus moving into a frame blurs the window first: look once it has landed
	const later = () => setTimeout(apply);
	for (const event of ['blur', 'focus']) window.addEventListener(event, later);
	document.addEventListener('visibilitychange', later);
	void SETTINGS.muteInBackground.sync(apply);
};

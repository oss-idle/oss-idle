import { desktop } from '@oss-idle/shared/desktop';
import Synced from '@oss-idle/shared/helpers/synced';
import type { PlayDeltas } from '@oss-idle/shared/play';
import { ScoreDTO } from '@oss-idle/shared/score';

import { Score } from './db/schema/score';
import { devTools } from './dev/devTools';

// spelled out rather than DEV_TOOLS, so a release build folds it to a literal
export const debugMode = new Synced(import.meta.env.DEV
	|| (import.meta.env.MODE === 'staging' && devTools.debug));

/** Debug: scales the xp a play awards, so the long progression thresholds are
 *  reachable while testing. The server refuses it outside development. */
export const DEBUG_XP_STEPS = [1, 10, 100, 1000, 10000, 100000] as const;
export const debugXpMultiplier = new Synced<number>(1);

// True on touch-primary devices (phones/tablets): coarse pointer + no hover.
export const isMobile = window.matchMedia('(pointer: coarse) and (hover: none)').matches;

export const isStandalone = new Synced(!!desktop());

export const isWebOpen = new Synced(false);
export const isOptionsOpen = new Synced(false);
export const isCommunityOpen = new Synced(false);
/** Local or online play, asked before the first play on a device with no character. */
export const isPlayChoiceOpen = new Synced(false);
/** The main menu closed itself after a while without input. */
export const menuIdle = new Synced(false);
export const webUrl = new Synced('/');
/** The site as someone else can open it: the desktop app's frame runs on app://. */
export const SITE_URL = import.meta.env.VITE_SITE_URL || location.origin;

/** The full-screen page overlay (skins / add-ons / character / the play queue / oss!direct);
 *  undefined = closed. */
export type OpenPage =
	| {
		page: 'skins' | 'addons',
		view: 'manage' | 'browse',
	}
	| { page: 'character' }
	| { page: 'queue' }
	| { page: 'direct' };
export const openPage = new Synced<OpenPage | undefined>(undefined);

export const isVolumeVisible = new Synced(false);

export const message = new Synced('');

export const currentScore = new Synced<Score | ScoreDTO | undefined>(undefined);

/** The latest ranked score's profile movement, floated app-wide by
 *  FloatingDeltas; `at` keys each showing so a new score restarts the
 *  animation. */
export const playDeltas = new Synced<{ deltas: PlayDeltas; at: number } | undefined>(undefined);

export const showDeltas = (deltas: PlayDeltas): void => {
	if (!deltas.rank && !deltas.rankedScore && !deltas.pp) return;
	void playDeltas.set({
		deltas, at: Date.now(),
	});
};
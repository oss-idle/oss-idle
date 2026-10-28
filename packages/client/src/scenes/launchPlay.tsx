import { confirmOpen } from '../components/ConfirmPrompt';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import type { TestPlay } from './Gameplay';
import SceneManager, { SCENE } from './SceneManager';
import { Transition } from './Transition';

// guards against launching the same play twice (a double click, or a queue
// advance racing a manual launch): a ranked map would mint two server-side
// tokens but only one gets validated, costing the player the play.
//
// It is time-bounded on purpose. It used to be cleared only when the cover
// finished rising; anything that stopped that promise resolving left the guard
// stuck, and from then on every launch - including the queue's - was silently a
// no-op. A stuck guard must not be able to end the idle loop.
let launching = 0;
const LAUNCH_GUARD_MS = 5000;

/**
 * Launch gameplay for a downloaded difficulty. Resolves the play over the
 * current scene (asking there if it must), then fades to black and hands off
 * to the gameplay scene, which reveals itself once its first frame is painted
 */
export function launchPlay(beatmap: LightBeatmap, debug = false, test?: TestPlay): boolean {
	// the intro (standard mode) and any other non-4K diff; the editor's test play takes any
	if (!test && !beatmap.isPlayable()) return false;
	// the player is answering an earlier launch's question
	if (confirmOpen()) return false;
	if (Date.now() - launching < LAUNCH_GUARD_MS) return false;
	launching = Date.now();
	void (async () => {
		const { bootPlay } = await import('./bootPlay');
		const boot = await bootPlay(beatmap, debug, test);
		if (!boot) {
			launching = 0;
			return;
		}
		const transition = Transition.begin();
		// swap to gameplay only once the cover is fully opaque - otherwise the scene
		// change shows through the still-transparent fade-in
		await transition.covered;
		SceneManager.set(SCENE.GAME, beatmap, boot, transition, test);
		launching = 0;
	})();
	return true;
}

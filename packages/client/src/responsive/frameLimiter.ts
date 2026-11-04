import { desktop } from '@oss-idle/shared/desktop';

import {
	type FrameLimit,
	SETTINGS,
} from '../db/settings';

/** A cap needs the desktop shell launched without Chromium's vsync cap, so one above
 *  the refresh rate can actually be reached. */
export const wantsUncapped = (limit: FrameLimit) => limit !== 'vsync';

/** A minimized window still runs its frame callbacks this often, so what waits on a
 *  frame moves on, without drawing frames no one sees. */
const MINIMIZED_INTERVAL_MS = 1000;

export const UNFOCUSED_FPS = 30;

/**
 * Caps every requestAnimationFrame loop in the app to the frame limiter: callbacks
 * queue up and run together on the first native frame once the cap's interval
 * has passed. CSS animations run on the compositor and aren't capped.
 */
export function initFrameLimiter(): void {
	const nativeRaf = window.requestAnimationFrame.bind(window);
	// two queues swapped each frame: a new one per frame is garbage
	let queue = new Map<number, FrameRequestCallback>();
	let run = new Map<number, FrameRequestCallback>();
	let nextId = 1;
	let scheduled = false;
	let last = 0;
	let minimized = false;
	let timer = 0;

	const pump = (now: number) => {
		timer = 0;
		const limit = SETTINGS.frameLimiter.get();
		let interval = minimized ? MINIMIZED_INTERVAL_MS
			: typeof limit === 'number' ? 1000 / limit : 0;
		// focus in the /web frame still counts: hasFocus covers the frames inside
		if (SETTINGS.capUnfocused.get() && !document.hasFocus())
			interval = Math.max(interval, 1000 / UNFOCUSED_FPS);
		const wait = interval - (now - last);
		// waited on a timer: with vsync lifted a native frame comes back at once,
		// so spinning on them renders the page flat out between capped frames
		if (wait > 1) {
			timer = window.setTimeout(() => nativeRaf(pump), wait);
			return;
		}
		// keep the cap's cadence through jitter, without bursting after a stall
		last = Math.max(last + interval, now - interval);
		scheduled = false;
		const ran = queue;
		queue = run;
		run = ran;
		for (const callback of ran.values()) {
			try { callback(now); } catch (e) { reportError(e); }
		}
		ran.clear();
	};

	window.requestAnimationFrame = callback => {
		const id = nextId++;
		queue.set(id, callback);
		if (!scheduled) {
			scheduled = true;
			nativeRaf(pump);
		}
		return id;
	};
	window.cancelAnimationFrame = id => { queue.delete(id); };

	desktop()?.onMinimizedChanged?.(on => {
		minimized = on;
		// CSS animations too (see index.css)
		document.documentElement.classList.toggle('is-minimized', on);
		if (on || !timer) return;
		// back up: draw now, not when the minimized wait runs out
		clearTimeout(timer);
		timer = 0;
		last = 0;
		nativeRaf(pump);
	});

	// Unlimited is gone - uncapped, the GPU drew frames no one saw and the start and the
	// overlays froze behind them - so a saved one is VSync now
	const saved: unknown = SETTINGS.frameLimiter.get();
	if (saved !== 'vsync' && typeof saved !== 'number') void SETTINGS.frameLimiter.set('vsync');
	SETTINGS.frameLimiter.forceSync(limit => desktop()?.frameRate.setUncapped(wantsUncapped(limit)));
}

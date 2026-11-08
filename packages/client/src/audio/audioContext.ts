const windowAudioContext = window as unknown as { 
	webkitAudioContext: typeof AudioContext 
};

/**
 * The single, app-wide Web Audio context. Music and sound effects share it on
 * purpose: scheduling is only sample-accurate *relative to the same clock*, and
 * two contexts have independent clocks and independent output latencies. Sharing
 * one is what lets gameplay hitsounds stay locked to the music - most visibly on
 * iOS, where the per-context latency is large.
 */
const Ctx = window.AudioContext
	|| windowAudioContext.webkitAudioContext;

/** Mobile browsers stop the context when the tab is left (iOS: `interrupted`) and
 *  may only start it again on a gesture, so every return and touch wakes it. */
function keepRunning(ctx: AudioContext): void {
	const wake = () => {
		if (document.visibilityState !== 'visible') return;
		if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
	};
	for (const event of ['visibilitychange', 'pageshow', 'pointerdown', 'touchend', 'keydown'])
		window.addEventListener(event, wake, { capture: true });
}

// HMR reuse so hot reloads don't leak contexts
const globalStore = globalThis as unknown as {
	__ossIdleCtx?: AudioContext,
	__ossIdleOut?: GainNode,
};
export const audioContext: AudioContext = globalStore.__ossIdleCtx ?? new Ctx();
if (!globalStore.__ossIdleCtx) keepRunning(audioContext);
globalStore.__ossIdleCtx = audioContext;

/** Where every sound of the game goes out: one gain over all of it (the background mute). */
export const speakers: GainNode = globalStore.__ossIdleOut ?? audioContext.createGain();
if (!globalStore.__ossIdleOut) speakers.connect(audioContext.destination);
globalStore.__ossIdleOut = speakers;

import Synced from '@oss-idle/shared/helpers/synced';

/** The one set preview a panel plays on the page, and how far along it is. */
export type Preview = {
	setId: number,
	state: 'loading' | 'playing' | 'paused',
	progress: number,
	time: number,
	duration: number,
};

export const preview = new Synced<Preview | undefined>(undefined);

/** Tells the game around the in-game browser, which mutes its music meanwhile. */
export type PreviewMessage = { type: 'oss-idle:preview', playing: boolean };

void preview.sync(p => {
	if (window.parent === window) return;
	const message: PreviewMessage = {
		type: 'oss-idle:preview', playing: !!p && p.state !== 'paused',
	};
	window.parent.postMessage(message, location.origin);
});

export type Volume = { level: number, muted: boolean };

const VOLUME_KEY = 'oss-idle:audio-volume';

const savedVolume = (): Volume => {
	try {
		const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '');
		if (typeof saved?.level === 'number') return {
			level: saved.level, muted: saved.muted === true, 
		};
	} catch { /* none saved */ }
	return {
		level: 0.25, muted: false, 
	};
};

/** The previews' volume, kept per browser; starts at 25%. */
export const volume = new Synced<Volume>(savedVolume());

let audio: HTMLAudioElement | undefined;

const applyVolume = (track: HTMLAudioElement) => {
	const { level, muted } = volume.get();
	track.volume = level;
	track.muted = muted;
};

volume.forceSync(v => {
	if (audio) applyVolume(audio);
	try { localStorage.setItem(VOLUME_KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
});

const stop = () => {
	audio?.pause();
	audio = undefined;
	void preview.set(undefined);
};

/** Play a set's preview, or pause/resume it when it is the current one; any other one stops. */
export const togglePreview = (setId: number, src: string) => {
	if (preview.get()?.setId === setId) return pausePreview();
	stop();
	const track = new Audio(src);
	audio = track;
	applyVolume(track);
	void preview.set({
		setId, state: 'loading', progress: 0, time: 0, duration: 0,
	});
	const mine = (then: () => void) => () => { if (audio === track) then(); };
	track.ontimeupdate = track.onplay = track.onpause = mine(() => void preview.set({
		setId,
		state: track.paused ? 'paused' : 'playing',
		progress: track.currentTime / (track.duration || 1),
		time: track.currentTime,
		duration: track.duration || 0,
	}));
	track.onended = track.onerror = mine(stop);
	track.play().catch(mine(stop));
};

/** Pause the current preview, or resume it. */
export const pausePreview = () => {
	if (!audio) return;
	if (audio.paused) void audio.play();
	else audio.pause();
};

/** Jump the current preview to a fraction of its length. */
export const seekPreview = (fraction: number) => {
	if (audio?.duration) audio.currentTime = fraction * audio.duration;
};

/** Stop the set's preview if it is the one playing (its panel went away). */
export const stopPreview = (setId: number) => {
	if (preview.get()?.setId === setId) stop();
};

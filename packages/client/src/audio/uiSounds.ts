import { SETTINGS } from '../db/settings';
import { audioContext } from './audioContext';
import {
	UI_SOUNDS,
	type UiSound,
} from './uiSoundNames';

export type { UiSound };

/** the files are kept under full scale; this brings them back to osu!'s level */
const FILE_GAIN = 1 / 0.6715;

let out: GainNode | undefined;
const bus = () => {
	if (out) return out;
	out = audioContext.createGain();
	out.connect(audioContext.destination);
	const level = () => out?.gain.setTargetAtTime(
		SETTINGS.mainVolume.get() * SETTINGS.effectVolume.get() * FILE_GAIN, audioContext.currentTime, 0.02,
	);
	void SETTINGS.mainVolume.sync(level);
	void SETTINGS.effectVolume.sync(level);
	return out;
};

const buffers = new Map<UiSound, Promise<AudioBuffer>>();
const load = async (sound: UiSound) => {
	const file = await fetch(`/sounds/ui/${sound}.ogg`);
	return audioContext.decodeAudioData(await file.arrayBuffer());
};
/** a sound that failed to load is tried again the next time */
const bufferOf = (sound: UiSound) => {
	let buffer = buffers.get(sound);
	if (!buffer) {
		buffer = load(sound).catch((e: unknown) => {
			buffers.delete(sound);
			throw e;
		});
		buffers.set(sound, buffer);
	}
	return buffer;
};

/** the sounds heard most, loaded first */
const FIRST: UiSound[] = [
	'ui/default-hover', 'ui/default-select', 'ui/cursor-tap', 'ui/button-hover',
];

/** Load every sound ahead of its first use, one after the other. */
export const prepareUiSounds = async () => {
	const rest = UI_SOUNDS.filter(s => !FIRST.includes(s));
	for (const sound of [...FIRST, ...rest]) await bufferOf(sound).catch(() => undefined);
};

export type UiSoundOptions = {
	/** playback rate: higher is higher and shorter */
	pitch?: number,
	/** -1 left .. 1 right */
	pan?: number,
	volume?: number,
	/** the same sound again within this many ms is dropped */
	gap?: number,
};

/** A pitch of 1 give or take `spread`, for sounds that repeat often. */
export const around = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

const last = new Map<UiSound, number>();

/** Play an interface sound now (the same one again within `gap` ms is dropped); returns what stops it. */
export const uiSound = (sound: UiSound, {
	pitch = 1, pan = 0, volume = 1, gap = 20,
}: UiSoundOptions = {}) => {
	const now = performance.now();
	if (now - (last.get(sound) ?? -Infinity) < gap) return () => {};
	last.set(sound, now);
	let stopped = false;
	let source: AudioBufferSourceNode | undefined;
	void bufferOf(sound).then(buffer => {
		if (stopped) return;
		source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = pitch;
		const gain = audioContext.createGain();
		gain.gain.value = volume;
		const panner = audioContext.createStereoPanner();
		panner.pan.value = pan;
		source.connect(gain).connect(panner).connect(bus());
		source.start();
	}).catch(() => undefined);
	return () => {
		stopped = true;
		source?.stop();
	};
};

/** osu!'s slider notch: higher the further along, dropped at either end. */
export const notchTick = (fraction: number, rise = 0.2) => {
	const end = fraction <= 0 || fraction >= 1 ? -0.5 : 0;
	uiSound('ui/notch-tick', {
		pitch: 0.99 + Math.random() * 0.02 + fraction * rise + end, gap: 30, 
	});
};

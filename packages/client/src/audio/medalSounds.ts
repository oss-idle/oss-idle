import type { MedalTier } from '@oss-idle/shared/achievements/medal';

import { SETTINGS } from '../db/settings';
import {
	audioContext,
	speakers,
} from './audioContext';
import * as synth from './medalSynth';

/** Medals follow the main volume only, not the effects one. */
const mainVolume = () => {
	const gain = audioContext.createGain();
	gain.connect(speakers);
	void SETTINGS.mainVolume.sync(v => gain.gain.setTargetAtTime(v, audioContext.currentTime, 0.02));
	return gain;
};

let bus: ReturnType<typeof synth.makeBus> | undefined;
const live = () => {
	bus ??= synth.makeBus(audioContext, mainVolume());
	return {
		bus, t: audioContext.currentTime + 0.01,
	};
};

export const medalWhoosh = () => {
	const { bus, t } = live();
	synth.whoosh(bus, t);
};

export const medalReveal = (tier: MedalTier) => {
	const { bus, t } = live();
	synth.reveal(bus, t, tier);
};

export const medalTick = (index: number, count: number) => {
	const { bus, t } = live();
	synth.tick(bus, t, index, count);
};

export const medalFinale = () => {
	const { bus, t } = live();
	synth.finale(bus, t + 0.35);
};

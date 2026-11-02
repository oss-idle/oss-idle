import type { Mod } from '../../mods.js';
import {
	JUDGEMENT,
	type Judgement,
	Judgements,
} from './judgement.js';

/** The worst judgement a play survives (SD: anything but a miss, PF: perfect, JT: marvelous). */
export const worstAllowed = (mods: readonly Mod[]): Judgement | undefined =>
	mods.includes('JT') ? JUDGEMENT.MARVELOUS
		: mods.includes('PF') ? JUDGEMENT.PERFECT
			: mods.includes('SD') ? JUDGEMENT.BAD
				: undefined;

/** Whether `judgement` fails a play held to `worst`. */
export const failsOn = (judgement: Judgement, worst: Judgement | undefined): boolean =>
	worst !== undefined && Judgements.indexOf(judgement) > Judgements.indexOf(worst);

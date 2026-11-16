import type { BigLike } from '../big.js';
import { OVERDRIVE_SYMBOL } from '../upgrades.js';
import { formatBig } from './num.js';

/** The player-facing form of an overdrive value: "3.4σ", "2.41kσ". */
export const overdriveText = (value: BigLike): string =>
	formatBig(value, 1) + OVERDRIVE_SYMBOL;

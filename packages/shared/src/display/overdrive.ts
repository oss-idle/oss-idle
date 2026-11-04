import { OVERDRIVE_SYMBOL } from '../upgrades.js';
import { bignum } from './num.js';

/** The player-facing form of an overdrive value: "3.4σ", "2.41kσ". */
export const overdriveText = (value: number): string =>
	bignum(value, 1) + OVERDRIVE_SYMBOL;

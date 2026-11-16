import type { ReactNode } from 'react';

import {
	Big,
	type BigLike,
	toText,
} from '../big.js';
import { xpForLevel } from '../xp.js';
import { levelFromXp } from './levelDisplay.js';

const ensureNum = (n?: number | string): number =>
	typeof n === 'number' ? n : parseFloat(n ?? '0');

const num = (
	n?: number | string,
	decimals = 0,
) => {
	const v = Math.floor(ensureNum(n) * Math.pow(10, decimals))
		/ Math.pow(10, decimals);
	return v.toLocaleString('en-US');
};

export const bpm = (n?: number | string) =>
	num(
		ensureNum(n),
		ensureNum(n) === Math.floor(ensureNum(n)) ? 3 : 0,
	);

/** Plain-text `level()`: "100.07" past level 100, for string-only contexts. */
export const levelText = (level: number, xp: number): string => {
	if (level < 100) return String(level);
	const p = Math.floor(xp / xpForLevel(level).toNumber() * 100);
	return p > 0 ? `${level}.${String(p).padStart(2, '0')}` : String(level);
};

/** A skill or overall level. The drawing rules live in levelDisplay. */
export const level = (level: number, xp: number): ReactNode => levelFromXp(level, xp);

const SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// truncated rather than rounded so it never reads higher than it is
const cut = (x: number, d: number) =>
	(Math.floor(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);

/** Digits and decimal exponent of a value of 1000 or more, read from its exact text. */
const digitsOf = (v: Big): { digits: string, exp: number } => {
	const [mantissa, e = '0'] = toText(v).split('e');
	const point = mantissa.indexOf('.');
	return {
		digits: mantissa.replace('.', ''),
		exp: Number(e) + (point < 0 ? mantissa.length : point) - 1,
	};
};

/** Short form: 742, 10.45k, 2.82M, 1.00Dc, 1.23e36. `decimals` only applies under 1000. */
export const formatBig = (value: BigLike, decimals = 0): string => {
	const v = Big.from(value);
	if (v.lt(-1000)) return `-${formatBig(v.abs())}`;
	if (v.lt(1000)) return cut(v.toNumber(), decimals);
	const { digits, exp } = digitsOf(v);
	const group = Math.floor(exp / 3);
	const shift = group < SUFFIXES.length ? exp - group * 3 : 0;
	const padded = digits.padEnd(shift + 3, '0');
	const whole = padded.slice(0, shift + 1);
	const fraction = padded.slice(shift + 1, shift + 3);
	return group < SUFFIXES.length
		? `${whole}.${fraction}${SUFFIXES[group]}`
		: `${whole}.${fraction}e${exp}`;
};

/** A multiplier: x1.61, x13.78k. */
export const formatMultiplier = (value: BigLike): string => `x${formatBig(value, 2)}`;

export default num;
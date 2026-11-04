import type { ReactNode } from 'react';

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
	const p = Math.floor(xp / xpForLevel(level) * 100);
	return p > 0 ? `${level}.${String(p).padStart(2, '0')}` : String(level);
};

/** A skill or overall level. The drawing rules live in levelDisplay. */
export const level = (level: number, xp: number): ReactNode => levelFromXp(level, xp);

const SUFFIXES = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']] as const;

/** Short form: 742, 10.45k, 2.82M. `decimals` only applies under 1000. */
export const bignum = (n?: number | string | null, decimals = 0): string => {
	const v = ensureNum(n ?? '0');
	// truncated rather than rounded so it never reads higher than it is
	const cut = (x: number, d: number) =>
		(Math.floor(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
	const suffix = SUFFIXES.find(([at]) => v >= at);
	return suffix ? `${cut(v / suffix[0], 2)}${suffix[1]}` : cut(v, decimals);
};

export default num;
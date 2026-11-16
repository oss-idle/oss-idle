import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
import cubic_bezier from '@oss-idle/shared/math/cubic_bezier';
import {
	gainLevels,
	heldTotal,
	P,
	Q,
	xpForLevel,
	xpGivesLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

const progressionCurve = cubic_bezier(.1, .4, .95, 0);
const lateProgressionCurve = cubic_bezier(.5, 0, 1, .4);

const oldXpForLevel = (level: number): number => {
	const steps = level - 99;
	const late = level < 100
		? 0
		: steps * (steps + 1) / 2 * 10_000_000 * 1.25 ** Math.floor((level - 100) / 10);
	return 100
		+ (progressionCurve(level / 100) * 9900)
		+ (lateProgressionCurve((level - 60) / 40) * 90000)
		+ late;
};

const oldXpToLevel = (level: number): number => {
	let total = 0;
	for (let i = 0; i < level; i++) total += oldXpForLevel(i);
	return total;
};

const oldGainLevels = (level: number, xp: number, gained: number) => {
	xp += gained;
	let levels = 0;
	while (xp > oldXpForLevel(level)) {
		xp -= oldXpForLevel(level);
		level++;
		levels++;
	}
	return {
		level, xp, levels,
	};
};

const rel = (a: Big, b: Big): number =>
	(b.isZero() ? a.abs() : a.sub(b).abs().div(b.abs())).toNumber();

describe('closed-form level maths', () => {
	it('matches the old walk to 1e-12', () => {
		for (let L = 0; L <= 2000; L++)
			expect(rel(xpToLevel(L), Big.from(oldXpToLevel(L)))).toBeLessThan(1e-12);
	});
	it('is exact below level 100', () => {
		for (let L = 0; L <= 100; L++) expect(xpToLevel(L).toNumber()).toBe(oldXpToLevel(L));
	});
	it('keeps the old cost per level', () => {
		for (let L = 0; L <= 2000; L++) expect(xpForLevel(L).toNumber()).toBe(oldXpForLevel(L));
	});
	it('gives back the level its own cost reaches', () => {
		for (let L = 0; L <= 3000; L++) {
			const { level, xp } = xpGivesLevel(xpToLevel(L));
			expect(level).toBe(L);
			expect(xp.isZero()).toBe(true);
		}
	});
	it('rounds a fractional level up, like the old walk', () => {
		for (const L of [0.5, 50.5, 99.5, 100.5, 105.25, 250.9])
			expect(rel(xpToLevel(L), Big.from(oldXpToLevel(L)))).toBeLessThan(1e-12);
	});
	it('round-trips', () => {
		const xs = ['0', '99999', '1e15', '1e300', '1e3000', '1e10000000000000', '1e1000000000000000'];
		for (const x of xs) {
			const { level, xp } = xpGivesLevel(Big.from(x));
			expect(rel(heldTotal(level, xp), Big.from(x))).toBeLessThan(1e-12);
			// past 2^53 levels a double can't step one level at a time
			if (level < 2 ** 53) expect(xp.lt(xpForLevel(level))).toBe(true);
		}
	});
	it('gains levels like the old walk', () => {
		expect(gainLevels(0, 0, 100)).toEqual({
			level: 0, xp: Big.from(100), levels: 0,
		});
		expect(gainLevels(0, 0, 101).level).toBe(1);
		const old = oldGainLevels(40, 7, 500000);
		const gained = gainLevels(40, 7, 500000);
		expect(gained.level).toBeLessThan(100);
		expect(gained.level).toBe(old.level);
		expect(gained.levels).toBe(old.levels);
		expect(gained.xp.toNumber()).toBe(old.xp);
		expect(gainLevels(150, 0, xpForLevel(150)).level).toBe(150);
		const late = gainLevels(150, 0, xpForLevel(150).add(xpForLevel(151).div(2)));
		expect(late.level).toBe(151);
		expect(rel(late.xp, xpForLevel(151).div(2))).toBeLessThan(1e-12);
		const far = gainLevels(10, 5, Big.from('1e3000'));
		expect(far.level).toBe(xpGivesLevel(heldTotal(10, Big.from(5).add(Big.from('1e3000')))).level);
		expect(far.levels).toBe(far.level - 10);
		const top = 2 ** 53 + 1e6;
		expect(gainLevels(top, 0, xpForLevel(top).mul(50)).levels).toBeGreaterThan(0);
	});
	it('is fast', () => {
		const t = performance.now();
		for (let i = 0; i < 1000; i++) xpGivesLevel(Big.from('1e1000000000000000'));
		expect(performance.now() - t).toBeLessThan(200);
	});
	it('the Q constants solve the tier recurrence', () => {
		for (let k = 0; k < 50; k++) expect(1.25 * Q(k + 1) - Q(k)).toBeCloseTo(P(k), 6);
	});
});

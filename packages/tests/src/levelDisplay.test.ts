import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	LEVEL_COLOUR_MAX,
	LEVEL_COLOUR_MIN,
	levelClass,
} from '@oss-idle/shared/display/levelDisplay';
import { levelProgress } from '@oss-idle/shared/xp';
import { xpForLevel } from '@oss-idle/shared/xp';

import { levelPercent } from '../../server/src/api/levelPercent';

/** The rules every level on screen follows. They live in one helper precisely
 *  so they cannot drift apart between screens - these pin them. */
describe('how a level is drawn', () => {
	it('takes its colour from the ramp while it is on it', () => {
		for (let l = LEVEL_COLOUR_MIN; l <= LEVEL_COLOUR_MAX; l++) {
			expect(levelClass(l)).toBe(`level_container level_${l}`);
		}
	});

	it('keeps the ramp\'s last colour above it, never falling through to none', () => {
		for (const l of [111, 120, 150, 999]) {
			expect(levelClass(l), `level ${l}`)
				.toBe(`level_container level_${LEVEL_COLOUR_MAX}`);
		}
	});

	it('ignores the progress inside the level when picking the colour', () => {
		expect(levelClass(105.99)).toBe(levelClass(105));
	});

	it('reads progress as a fraction of what the next level costs', () => {
		expect(levelProgress(105, 0)).toBe(0);
		expect(levelProgress(105, xpForLevel(105).toNumber() * 0.45)).toBeCloseTo(0.45, 5);
		expect(levelProgress(105, xpForLevel(105).toNumber())).toBe(1);
	});

	it('never lets progress leave [0, 1]', () => {
		expect(levelProgress(105, -50)).toBe(0);
		expect(levelProgress(105, xpForLevel(105).toNumber() * 10)).toBe(1);
	});
});

describe('levelPercent', () => {
	it('is the share of the next level banked, floored to a whole percent', () => {
		expect(levelPercent(100, 0)).toBe(0);
		expect(levelPercent(100, xpForLevel(100).toNumber() * 0.185)).toBe(18);
		expect(levelPercent(5, xpForLevel(5).toNumber() / 2)).toBe(50);
	});
	it('stays within 0 to 99', () => {
		expect(levelPercent(100, xpForLevel(100).toNumber())).toBe(99);
		expect(levelPercent(100, -5)).toBe(0);
	});
});

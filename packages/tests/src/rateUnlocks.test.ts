import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	allowedRate,
	rateSteps,
	rateUnlocks,
} from '@oss-idle/shared/rate';

describe('rate unlocks', () => {
	it('keeps one step per prestige once upgrades are reset', () => {
		expect(rateSteps(rateUnlocks(0, 0))).toEqual([1]);
		expect(rateSteps(rateUnlocks(0, 1))).toEqual([0.95, 1, 1.05]);
		expect(rateSteps(rateUnlocks(0, 2))).toEqual([0.9, 0.95, 1, 1.05, 1.1]);
	});

	it('adds upgrades on top of prestiges', () => {
		expect(allowedRate(1.15, rateUnlocks(1, 2))).toBe(1.15);
		expect(allowedRate(1.2, rateUnlocks(1, 2))).toBe(1.15);
		expect(allowedRate(0.5, rateUnlocks(10, 3))).toBe(0.5);
	});
});

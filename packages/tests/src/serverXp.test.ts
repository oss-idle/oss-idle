import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
import { fatigueXp } from '@oss-idle/shared/fatigue';

import {
	applyXpRules,
	NO_HISTORY,
} from '../../server/src/rulesets/mania/xpRules';

const rules = {
	mindblock: [], modMultipliers: { stamina: 1 }, fatigue: 0.5,
};

describe('applyXpRules', () => {
	it('floors raw x every multiplier once, past 1e300', () => {
		const multiplier = Big.from(1.1).pow(8000);
		const xp = applyXpRules(['stamina'], { stamina: 3000 }, () => multiplier, rules, NO_HISTORY);
		const expected = Math.log10(3000 * fatigueXp(0.5)) + 8000 * Math.log10(1.1);
		expect(xp.stamina.log10()).toBeCloseTo(expected, 9);
	});

	it('gives zero for no raw xp', () => {
		const xp = applyXpRules(['stamina'], { stamina: 0 }, () => Big.from('1e5000'), rules, NO_HISTORY);
		expect(xp.stamina.isZero()).toBe(true);
	});

	it('adds a first X to accuracy after flooring', () => {
		const xp = applyXpRules([], { accuracy: 10.9 }, () => Big.from(1.5), {
			mindblock: [], modMultipliers: { accuracy: 1 }, fatigue: 0,
		}, {
			...NO_HISTORY, firstX: 500,
		});
		expect(xp.accuracy.toNumber()).toBe(Math.floor(10.9 * 1.5) + 500);
	});

	it('mods scale a first X too', () => {
		const xp = applyXpRules([], { accuracy: 10.9 }, () => Big.from(1.5), {
			mindblock: [], modMultipliers: { accuracy: 0.5 }, fatigue: 0,
		}, {
			...NO_HISTORY, firstX: 501,
		});
		expect(xp.accuracy.toNumber()).toBe(Math.floor(10.9 * 1.5 * 0.5) + Math.floor(501 * 0.5));
	});
});

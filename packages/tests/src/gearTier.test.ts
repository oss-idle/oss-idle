import {
	describe,
	expect,
	it,
} from 'vitest';

import { romanTier } from '@oss-idle/shared/rulesets/mania/gear';

describe('gear tier names', () => {
	it('keeps counting in Roman numerals, then as a number', () => {
		expect(romanTier(2)).toBe('II');
		expect(romanTier(21)).toBe('XXI');
		expect(romanTier(3999)).toBe('MMMCMXCIX');
		expect(romanTier(4000)).toBe('4,000');
	});
});

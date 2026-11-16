import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
import {
	formatBig,
	formatMultiplier,
} from '@oss-idle/shared/display/num';

describe('big number formatting', () => {
	it('uses suffixes then scientific, truncating', () => {
		expect(formatBig(999)).toBe('999');
		expect(formatBig(2300)).toBe('2.30k');
		expect(formatBig(1150)).toBe('1.15k');
		expect(formatBig(1e15)).toBe('1.00Qa');
		expect(formatBig(1e33)).toBe('1.00Dc');
		expect(formatBig(9.999e35)).toBe('999.90Dc');
		expect(formatBig(1e36)).toBe('1.00e36');
		expect(formatBig(Big.from('1.239e9000000000000000'))).toBe('1.23e9000000000000000');
		expect(formatBig(-2300)).toBe('-2.30k');
		expect(formatBig(0)).toBe('0');
		expect(formatBig(1.5, 1)).toBe('1.5');
	});

	it('formats multipliers', () => {
		expect(formatMultiplier(1.6123)).toBe('x1.61');
		expect(formatMultiplier(13780.61)).toBe('x13.78k');
	});
});

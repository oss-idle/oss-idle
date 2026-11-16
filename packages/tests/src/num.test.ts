import {
	describe,
	expect,
	it,
} from 'vitest';

import { bigStyle } from '@oss-idle/shared/display/bigTheme';
import { formatBig } from '@oss-idle/shared/display/num';

describe('formatBig', () => {
	it('leaves an unsuffixed number a plain integer', () => {
		expect(formatBig(0)).toBe('0');
		expect(formatBig(7)).toBe('7');
		expect(formatBig(490)).toBe('490');
		expect(formatBig(999)).toBe('999');
	});

	it('always carries two decimals once suffixed', () => {
		expect(formatBig(10_450)).toBe('10.45k');
		expect(formatBig(102_120)).toBe('102.12k');
		expect(formatBig(2_820_000)).toBe('2.82M');
		// a whole mantissa keeps its two digits rather than losing them
		expect(formatBig(301_000)).toBe('301.00k');
		expect(formatBig(1_000)).toBe('1.00k');
		expect(formatBig(45_000_000)).toBe('45.00M');
	});

	it('truncates rather than rounding up', () => {
		expect(formatBig(4_567)).toBe('4.56k');
		expect(formatBig(1_999)).toBe('1.99k');
	});

	it('scales through k, M, B and T', () => {
		expect(formatBig(1_000_000)).toBe('1.00M');
		expect(formatBig(1_000_000_000)).toBe('1.00B');
		expect(formatBig(1_000_000_000_000)).toBe('1.00T');
		expect(formatBig(4_200_000_000_000_000)).toBe('4.20Qa');
	});

	it('keeps decimals under 1000 only', () => {
		expect(formatBig(3.46, 1)).toBe('3.4');
		expect(formatBig(3, 1)).toBe('3.0');
		expect(formatBig(2410.5, 1)).toBe('2.41k');
	});
});

describe('bigStyle', () => {
	it('leaves numbers under 1000 alone', () => {
		expect(bigStyle(999, 'heat')).toBeUndefined();
	});

	it('lands on the theme colour at each suffix', () => {
		expect(bigStyle(1_000, 'heat')).toEqual({ color: 'rgb(255, 234, 160)' });
		expect(bigStyle(1_000_000, 'heat')).toEqual({ color: 'rgb(255, 193, 74)' });
		expect(bigStyle(1e12, 'heat')?.color).toBe('rgb(255, 79, 110)');
		expect(bigStyle(1e15, 'heat')?.color).toBe('rgb(255, 79, 110)');
	});
});

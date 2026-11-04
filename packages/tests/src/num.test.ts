import {
	describe,
	expect,
	it,
} from 'vitest';

import { bigStyle } from '@oss-idle/shared/display/bigTheme';
import { bignum } from '@oss-idle/shared/display/num';

describe('bignum', () => {
	it('leaves an unsuffixed number a plain integer', () => {
		expect(bignum(0)).toBe('0');
		expect(bignum(7)).toBe('7');
		expect(bignum(490)).toBe('490');
		expect(bignum(999)).toBe('999');
	});

	it('always carries two decimals once suffixed', () => {
		expect(bignum(10_450)).toBe('10.45k');
		expect(bignum(102_120)).toBe('102.12k');
		expect(bignum(2_820_000)).toBe('2.82M');
		// a whole mantissa keeps its two digits rather than losing them
		expect(bignum(301_000)).toBe('301.00k');
		expect(bignum(1_000)).toBe('1.00k');
		expect(bignum(45_000_000)).toBe('45.00M');
	});

	it('truncates rather than rounding up', () => {
		expect(bignum(4_567)).toBe('4.56k');
		expect(bignum(1_999)).toBe('1.99k');
	});

	it('scales through k, M, B and T', () => {
		expect(bignum(1_000_000)).toBe('1.00M');
		expect(bignum(1_000_000_000)).toBe('1.00B');
		expect(bignum(1_000_000_000_000)).toBe('1.00T');
		expect(bignum(4_200_000_000_000_000)).toBe('4200.00T');
	});

	it('keeps decimals under 1000 only', () => {
		expect(bignum(3.46, 1)).toBe('3.4');
		expect(bignum(3, 1)).toBe('3.0');
		expect(bignum(2410.5, 1)).toBe('2.41k');
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

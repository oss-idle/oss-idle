import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	Big,
	bigNonNegSchema,
	bigSchema,
	fromWire,
	ONE,
	toJson,
	toText,
	ZERO,
} from '@oss-idle/shared/big';

describe('Big', () => {
	it('is exact like a double below 1e300', () => {
		for (const n of [0, 1, 471223136, 936381, 2 ** 53 - 1, 4503599627370496, 1e299])
			expect(Big.from(n).toNumber()).toBe(n);
		expect(Big.from(2 ** 52).add(1).toNumber()).toBe(2 ** 52 + 1);
		expect(Big.from(471223136).floor().toNumber()).toBe(471223136);
	});
	it('crosses 1e300 both ways', () => {
		const big = Big.from(1e299).mul(100);
		expect(toText(big)).toBe('1e301');
		expect(big.div(100).toNumber()).toBe(1e299);
		expect(Big.from('1.2345678901234567e305').log10()).toBeCloseTo(305.0915149, 6);
	});
	it('reaches 1e(9e15)', () => {
		const b = Big.from('1e4000000000000000');
		expect(b.gt(Big.from('1e3999999999999999'))).toBe(true);
		expect(b.mul(b).log10()).toBe(8e15);
	});
	it('text form', () => {
		expect(toText(Big.from(123456789))).toBe('123456789');
		expect(toText(Big.from(2780.500308474033))).toBe('2780.500308474033');
		expect(toText(Big.from(1e21))).toBe('1e21');
		expect(toJson(Big.from(2 ** 53 - 1))).toBe(2 ** 53 - 1);
		expect(toJson(Big.from(2 ** 53))).toBe('9007199254740992');
	});
	it('refuses bad values', () => {
		for (const v of [NaN, Infinity, 'abc', '1e', ''] as const) expect(() => fromWire(v)).toThrow();
		expect(bigSchema.safeParse(Infinity).success).toBe(false);
		expect(bigSchema.parse('1e400').log10()).toBe(400);
		expect(JSON.stringify({ x: Big.from(5) })).toBe('{"x":5}');
	});

	it('refuses operators, prints as text', () => {
		const [a, b] = [Big.from(1), Big.from(2)] as unknown as number[];
		expect(() => a < b).toThrow(RangeError);
		expect(String(Big.from(5))).toBe('5');
		expect(`${Big.from('1e400')}`).toBe('1e400');
	});

	it('refuses negatives where they cannot be', () => {
		expect(bigNonNegSchema.parse(0).isZero()).toBe(true);
		expect(bigNonNegSchema.parse('1e400').log10()).toBe(400);
		expect(bigNonNegSchema.safeParse(-1).success).toBe(false);
		expect(bigNonNegSchema.safeParse('-1e400').success).toBe(false);
		expect(bigNonNegSchema.safeParse(NaN).success).toBe(false);
	});

	it('matches double arithmetic below 1e300', () => {
		const pairs = [
			[0.1, 0.2],
			[471223136, 3.7],
			[2780.500308474033, 1e-9],
			[-5, 12.25],
			[1e150, 3e149],
		];
		for (const [a, b] of pairs) {
			expect(Big.from(a).add(b).toNumber()).toBe(a + b);
			expect(Big.from(a).sub(b).toNumber()).toBe(a - b);
			expect(Big.from(a).mul(b).toNumber()).toBe(a * b);
			expect(Big.from(a).div(b).toNumber()).toBe(a / b);
		}
		expect(Big.from(1.5).pow(3).toNumber()).toBe(1.5 ** 3);
	});
	it('works past where a double overflows', () => {
		const a = Big.from(1e200).mul(1e200);
		expect(toText(a)).toBe('1e400');
		expect(a.toNumber()).toBe(Infinity);
		expect(toText(a.add(a))).toBe('2e400');
		expect(a.sub(a).isZero()).toBe(true);
		expect(toText(a.add(1))).toBe('1e400');
		expect(a.div(Big.from('1e300')).toNumber()).toBe(1e100);
		expect(toText(Big.from(10).pow(500))).toBe('1e500');
		expect(Big.from('1e400').pow(2).log10()).toBe(800);
		expect(a.floor().eq(a)).toBe(true);
		expect(a.ceil().eq(a)).toBe(true);
	});
	it('handles negatives', () => {
		const a = Big.from('-3e400');
		expect(a.lt(0)).toBe(true);
		expect(a.lt(Big.from('-1e400'))).toBe(true);
		expect(toText(a.abs())).toBe('3e400');
		expect(toText(a.mul(-1))).toBe('3e400');
		expect(Big.from(5).sub(7).toNumber()).toBe(-2);
		expect(Big.from(-2.5).floor().toNumber()).toBe(-3);
		expect(Big.from(-2.5).ceil().toNumber()).toBe(-2);
		expect(Big.from(2 ** 52 + 1).round().toNumber()).toBe(2 ** 52 + 1);
		expect(Big.from(2.5).round().toNumber()).toBe(3);
		expect(Big.from(-2.5).round().toNumber()).toBe(-2);
		expect(Big.from(0.49999999999999994).round().toNumber()).toBe(0);
		expect(fromWire('-1.5e400').cmp(fromWire('-1.5e400'))).toBe(0);
	});
	it('compares across forms', () => {
		const big = Big.from('1e301');
		expect(big.gt(1e299)).toBe(true);
		expect(Big.from(1e299).lt(big)).toBe(true);
		expect(big.gte(big)).toBe(true);
		expect(big.lte(1)).toBe(false);
		expect(toText(big.max(3))).toBe('1e301');
		expect(big.min(3).toNumber()).toBe(3);
		expect(ZERO.isZero()).toBe(true);
		expect(ONE.toNumber()).toBe(1);
	});
	it('round-trips the text and wire forms', () => {
		const texts = ['0', '-7', '0.1', '1e-7', '1e21', '1.2345678901234567e305', '-4.5e9000000000000000'];
		for (const s of texts) expect(toText(fromWire(s))).toBe(s);
		expect(toText(fromWire('1e+21'))).toBe('1e21');
		expect(toJson(Big.from('1e400'))).toBe('1e400');
		expect(toJson(Big.from(0.5))).toBe(0.5);
		expect(fromWire(12).toNumber()).toBe(12);
	});
	it('throws instead of NaN or Infinity', () => {
		expect(() => Big.from(1).div(0)).toThrow();
		expect(() => Big.from('1e400').div(ZERO)).toThrow();
		expect(() => Big.from(-2).pow(0.5)).toThrow();
		expect(() => Big.from('9e9000000000000000').mul(Big.from('9e9000000000000000'))).toThrow();
		expect(() => fromWire('1e9000000000000001')).toThrow();
		expect(bigSchema.safeParse('1e9000000000000001').success).toBe(false);
		expect(bigSchema.safeParse(NaN).success).toBe(false);
	});
});

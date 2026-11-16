import { z } from 'zod';

const PLAIN_MAX = 1e300;
const PLAIN_EXP = 300;
const TOP_EXP = 9e15;
const SAFE = 2 ** 53;
const TEXT = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/;

export type BigLike = Big | number;
type Parts = [m: number, e: number];

function partsOf(n: number): Parts {
	if (n === 0) return [0, 0];
	const [m, e] = n.toExponential().split('e');
	return [Number(m), Number(e)];
}

/** A plain number below 1e300, a signed mantissa in [1, 10) and an integer exponent above. */
export class Big {
	private constructor(
		readonly plain: number | undefined,
		readonly m = 0,
		readonly e = 0,
	) {}

	static from(v: BigLike | string): Big {
		if (v instanceof Big) return v;
		return typeof v === 'number' ? Big.ofNumber(v) : Big.parse(v);
	}

	/** m × 10^e, any m. */
	private static normal(m: number, e: number): Big {
		if (!Number.isFinite(m)) throw new RangeError(`Big: ${m}`);
		if (m === 0) return ZERO;
		while (Math.abs(m) >= 10) { m /= 10; e++; }
		while (Math.abs(m) < 1) { m *= 10; e--; }
		if (e < PLAIN_EXP) return Big.ofNumber(Number(`${m}e${e}`));
		if (e > TOP_EXP) throw new RangeError(`Big: past 1e${TOP_EXP}`);
		return new Big(undefined, m, e);
	}

	private static ofNumber(n: number): Big {
		if (!Number.isFinite(n)) throw new RangeError(`Big: ${n}`);
		if (Math.abs(n) < PLAIN_MAX) return new Big(n);
		const [m, e] = partsOf(n);
		return new Big(undefined, m, e);
	}

	private static parse(s: string): Big {
		if (!TEXT.test(s)) throw new RangeError(`Big: malformed "${s}"`);
		const n = Number(s);
		if (Number.isFinite(n)) return Big.ofNumber(n);
		const [ms, es = '0'] = s.split('e');
		const [m, e] = partsOf(Number(ms));
		return Big.normal(m, e + Number(es));
	}

	private static addParts([m1, e1]: Parts, [m2, e2]: Parts): Big {
		if (m1 === 0) return Big.normal(m2, e2);
		if (e2 > e1) return Big.addParts([m2, e2], [m1, e1]);
		if (m2 === 0 || e1 - e2 > 17) return Big.normal(m1, e1);
		return Big.normal(m1 + m2 / 10 ** (e1 - e2), e1);
	}

	private parts(): Parts {
		return this.plain === undefined ? [this.m, this.e] : partsOf(this.plain);
	}

	private op(
		o: BigLike,
		plain: (a: number, b: number) => number,
		parts: (a: Parts, b: Parts) => Big,
	): Big {
		const b = Big.from(o);
		if (this.plain !== undefined && b.plain !== undefined) {
			const r = plain(this.plain, b.plain);
			if (Number.isFinite(r)) return Big.ofNumber(r);
		}
		return parts(this.parts(), b.parts());
	}

	add(o: BigLike): Big {
		return this.op(o, (a, b) => a + b, Big.addParts);
	}

	sub(o: BigLike): Big {
		return this.op(o, (a, b) => a - b, (a, [m, e]) => Big.addParts(a, [-m, e]));
	}

	mul(o: BigLike): Big {
		return this.op(o, (a, b) => a * b, ([m1, e1], [m2, e2]) => Big.normal(m1 * m2, e1 + e2));
	}

	div(o: BigLike): Big {
		return this.op(o, (a, b) => a / b, ([m1, e1], [m2, e2]) => Big.normal(m1 / m2, e1 - e2));
	}

	pow(n: number): Big {
		if (this.plain !== undefined) {
			const r = this.plain ** n;
			if (Number.isFinite(r)) return Big.ofNumber(r);
			if (Number.isNaN(r) || this.plain === 0) throw new RangeError(`Big: ${this.plain} ** ${n}`);
		}
		const [m, e] = this.parts();
		if (m < 0 && !Number.isInteger(n)) throw new RangeError(`Big: negative ** ${n}`);
		const l = n * (e + Math.log10(Math.abs(m)));
		const le = Math.floor(l);
		return Big.normal((m < 0 && n % 2 !== 0 ? -1 : 1) * 10 ** (l - le), le);
	}

	floor(): Big {
		return this.plain === undefined ? this : new Big(Math.floor(this.plain));
	}

	ceil(): Big {
		return this.plain === undefined ? this : new Big(Math.ceil(this.plain));
	}

	/** Math.round's: an integer stays as it is. */
	round(): Big {
		return this.plain === undefined ? this : new Big(Math.round(this.plain));
	}

	abs(): Big {
		if (this.plain === undefined) return new Big(undefined, Math.abs(this.m), this.e);
		return new Big(Math.abs(this.plain));
	}

	cmp(o: BigLike): -1 | 0 | 1 {
		const b = Big.from(o);
		if (this.plain !== undefined && b.plain !== undefined)
			return this.plain < b.plain ? -1 : this.plain > b.plain ? 1 : 0;
		const [m1, e1] = this.parts();
		const [m2, e2] = b.parts();
		const s1 = Math.sign(m1);
		const s2 = Math.sign(m2);
		if (s1 !== s2) return s1 < s2 ? -1 : 1;
		if (e1 !== e2) return (e1 < e2 ? -s1 : s1) as -1 | 1;
		return m1 < m2 ? -1 : m1 > m2 ? 1 : 0;
	}

	lt(o: BigLike): boolean { return this.cmp(o) < 0; }
	lte(o: BigLike): boolean { return this.cmp(o) <= 0; }
	gt(o: BigLike): boolean { return this.cmp(o) > 0; }
	gte(o: BigLike): boolean { return this.cmp(o) >= 0; }
	eq(o: BigLike): boolean { return this.cmp(o) === 0; }
	max(o: BigLike): Big { return this.gte(o) ? this : Big.from(o); }
	min(o: BigLike): Big { return this.lte(o) ? this : Big.from(o); }

	log10(): number {
		return this.plain === undefined ? this.e + Math.log10(this.m) : Math.log10(this.plain);
	}

	/** Infinity above 1.8e308. */
	toNumber(): number {
		return this.plain ?? Number(`${this.m}e${this.e}`);
	}

	isZero(): boolean {
		return this.plain === 0;
	}

	toJSON(): number | string {
		return toJson(this);
	}

	valueOf(): never {
		throw new RangeError('Big: compare with .lt/.gt/.eq, not operators');
	}

	toString(): string {
		return toText(this);
	}
}

export const ZERO = Big.from(0);
export const ONE = Big.from(1);

/** Plain digits below 1e21, exponent form above. */
export function toText(b: Big): string {
	return b.plain === undefined ? `${b.m}e${b.e}` : String(b.plain).replace('e+', 'e');
}

/** A JSON number below 2^53, text above. */
export function toJson(b: Big): number | string {
	return b.plain !== undefined && Math.abs(b.plain) < SAFE ? b.plain : toText(b);
}

export function fromWire(v: number | string): Big {
	return Big.from(v);
}

export const bigSchema = z.union([z.number(), z.string()]).transform((v, ctx) => {
	try {
		return fromWire(v);
	} catch (err) {
		ctx.issues.push({
			code: 'custom',
			message: (err as Error).message,
			input: v,
		});
		return z.NEVER;
	}
});

export const bigNonNegSchema = bigSchema.refine(b => !b.lt(0), { message: 'must not be negative' });

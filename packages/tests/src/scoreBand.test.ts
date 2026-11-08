import {
	describe,
	expect,
	it,
} from 'vitest';

import { scoreBand } from '../../client/src/osu/beatmap/scoreBand';

describe('best score bands', () => {
	it('puts a score in the band of its floor, best first', () => {
		const label = (score: number) => scoreBand(score).label;
		expect(label(1_000_010)).toBe('>1M');
		expect(label(1_000_000)).toBe('1M');
		expect(label(999_999)).toBe('999k');
		expect(label(999_000)).toBe('999k');
		expect(label(998_999)).toBe('998k');
		expect(label(997_000)).toBe('997k');
		expect(label(996_999)).toBe('990k');
		expect(label(950_000)).toBe('950k');
		expect(label(949_999)).toBe('900k');
		expect(label(600_000)).toBe('600k');
		expect(label(599_999)).toBe('<600k');
		expect(label(0)).toBe('<600k');
		expect(scoreBand(1_000_000).order).toBeLessThan(scoreBand(999_000).order);
	});
});

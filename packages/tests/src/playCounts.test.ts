import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	axisScale,
	monthlySeries,
} from '@oss-idle/shared/display/playCounts';

/** The play history graph plots one point per month; these pin the filling that
 *  turns the server's sparse rows into that continuous line, and the y-axis
 *  that keeps its labels round. */
describe('monthly play series', () => {
	it('fills the months with no plays as zero', () => {
		const { counts, dates } = monthlySeries(
			[{
				d: '2026-01', plays: 2,
			}, {
				d: '2026-03', plays: 5,
			}],
			new Date('2026-03-31T23:00:00Z'),
		);
		expect(counts).toEqual([2, 0, 5]);
		expect(dates).toEqual(['2026-01', '2026-02', '2026-03']);
	});

	it('rolls over the year boundary without losing December', () => {
		const { counts, dates } = monthlySeries(
			[{
				d: '2025-11', plays: 7,
			}, {
				d: '2026-02', plays: 1,
			}],
			new Date('2026-02-01T00:00:00Z'),
		);
		expect(counts).toEqual([7, 0, 0, 1]);
		expect(dates).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
	});

	it('runs the zero line to the current month after the last play', () => {
		const { counts } = monthlySeries(
			[{
				d: '2026-01', plays: 4,
			}],
			new Date('2026-04-15T08:00:00Z'),
		);
		expect(counts).toEqual([4, 0, 0, 0]);
	});

	it('takes the current month from the UTC calendar, not the local one', () => {
		const { dates } = monthlySeries(
			[{
				d: '2025-12', plays: 1,
			}],
			new Date('2026-01-01T02:00:00Z'),
		);
		expect(dates).toEqual(['2025-12', '2026-01']);
	});

	it('has nothing to draw without plays', () => {
		expect(monthlySeries([])).toEqual({
			counts: [], dates: [],
		});
	});
});

describe('play history axis', () => {
	it('puts the peak on the top gridline, not below it', () => {
		expect(axisScale(8)).toEqual({
			step: 2, top: 8,
		});
	});

	it('rounds a big peak up to a readable step', () => {
		expect(axisScale(1166)).toEqual({
			step: 500, top: 1500,
		});
	});

	it('still draws an axis with no plays', () => {
		expect(axisScale(0)).toEqual({
			step: 1, top: 1,
		});
	});
});

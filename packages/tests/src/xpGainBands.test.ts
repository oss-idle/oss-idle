import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	bandsOf,
	perPlay,
} from '../../web/src/pages/admin/xpGains/bands';

describe('XP gains bands', () => {
	const data = bandsOf({
		skills: ['accuracy', 'speed'],
		rows: [
			{
				skill: 'accuracy', level: 3, plays: 2, xp: 100, 
			},
			{
				skill: 'accuracy', level: 9, plays: 2, xp: 300, 
			},
			{
				skill: 'speed', level: 99, plays: 1, xp: 7, 
			},
			{
				skill: 'speed', level: 102, plays: 4, xp: 40, 
			},
		],
	});

	it('bands by ten below 100, then by level up to the highest played', () => {
		expect(data.bands.map(b => b.label)).toEqual([
			'0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–99',
			'100', '101', '102',
		]);
	});

	it('averages a band over all its plays', () => {
		expect(perPlay(data.bands[0], 0)).toBe(100);
		expect(perPlay(data.bands[9], 1)).toBe(7);
		expect(perPlay(data.bands[12], 1)).toBe(10);
		expect(perPlay(data.bands[11], 1)).toBeUndefined();
	});
});

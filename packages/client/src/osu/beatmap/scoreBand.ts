import type { Group } from './grouping';

/** Best score bands, best first: a band holds scores from its floor up. */
const SCORE_BANDS: [floor: number, label: string][] = [
	[1_000_001, '>1M'],
	[1_000_000, '1M'],
	[999_000, '999k'],
	[998_000, '998k'],
	[997_000, '997k'],
	[990_000, '990k'],
	[950_000, '950k'],
	[900_000, '900k'],
	[800_000, '800k'],
	[700_000, '700k'],
	[600_000, '600k'],
	[0, '<600k'],
];

export const scoreBand = (score: number): Group => {
	const i = SCORE_BANDS.findIndex(([floor]) => score >= floor);
	const [, label] = SCORE_BANDS[i];
	return {
		key: `s${label}`, label, order: i,
	};
};

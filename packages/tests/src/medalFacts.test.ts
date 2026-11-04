import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	mergeFacts,
	type ScoreFacts,
} from '../../server/src/scoreFacts';

const none: ScoreFacts = {
	pass: 0, fc: 0, topPlay: 0, rice: false, ln: false, combo727: false,
	possessed: false, parallax: false, wonderful: false, grades: [],
};

describe('mergeFacts', () => {
	it('keeps the best of older scores and the new ones', () => {
		const old: ScoreFacts = {
			...none, pass: 7, fc: 5, topPlay: 310, rice: true, grades: ['S', 'A'],
		};
		const now: ScoreFacts = {
			...none, pass: 6, fc: 6, topPlay: 120, combo727: true, grades: ['SS', 'S'],
		};
		expect(mergeFacts(old, now)).toEqual({
			...none, pass: 7, fc: 6, topPlay: 310, rice: true, combo727: true, grades: ['S', 'A', 'SS'],
		});
	});

	it('changes nothing when no score was played since', () => {
		const old: ScoreFacts = {
			...none, pass: 4, ln: true, grades: ['B'],
		};
		expect(mergeFacts(old, none)).toEqual(old);
	});
});

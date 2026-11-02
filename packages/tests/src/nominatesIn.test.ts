import {
	describe,
	expect,
	it,
} from 'vitest';

import { nominatesIn } from '@oss-idle/shared/groups';

describe('nominatesIn', () => {
	it('an admin ranks everywhere', () => {
		expect(nominatesIn({ groups: ['admin'] }, 'mania4k')).toBe(true);
	});

	it('a nominator ranks in the rulesets granted, only', () => {
		const bn = {
			groups: ['bn'], nominates: ['mania7k'],
		} as const;
		expect(nominatesIn(bn, 'mania7k')).toBe(true);
		expect(nominatesIn(bn, 'mania4k')).toBe(false);
	});

	it('a moderator or a guest does not', () => {
		expect(nominatesIn({ groups: ['gmt'] }, 'mania7k')).toBe(false);
		expect(nominatesIn(undefined, 'mania7k')).toBe(false);
	});
});

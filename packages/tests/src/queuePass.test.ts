import {
	describe,
	expect,
	it,
} from 'vitest';

import { passMs } from '@oss-idle/shared/queue';

describe('passMs', () => {
	it('counts each map as many times as it has left', () => {
		const entries = [
			{ beatmapId: 1 },
			{
				beatmapId: 2, repeat: 3, played: 1,
			},
		];
		expect(passMs(entries, e => e.beatmapId * 1000)).toBe(1000 + 2 * 2000);
	});

	it('is nothing for an empty queue', () => {
		expect(passMs([], () => 1000)).toBe(0);
	});
});

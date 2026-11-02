import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { simulateBody } from '../../server/src/api/simulate';

vi.mock('../../server/src/env', () => ({
	env: {}, isProd: false,
}));
vi.mock('../../server/src/beatmaps', () => ({}));
vi.mock('../../server/src/db/client', () => ({}));

describe('the sim API\'s body', () => {
	it('takes overdrive as the game keeps it: fractional, with no limit', () => {
		const body = simulateBody.parse({
			beatmap_id: 1, skills: {
				speed: {
					level: 80, overdrive: 28504.40487685265,
				},
			},
		});
		expect(body.skills.speed?.overdrive).toBe(28504.40487685265);
	});
});

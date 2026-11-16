import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { userStatistics } from '../../server/src/api/objects';
import { simulateBody } from '../../server/src/api/simulate';
import {
	simInputFromWire,
	simInputToWire,
} from '../../server/src/rulesets/mania/4k/simState';
import { Big } from '../../shared/src/big';
import { mania4k } from '../../shared/src/rulesets/mania/4k/index';

vi.mock('../../server/src/env', () => ({
	env: {}, isProd: false, isPbe: false,
}));
vi.mock('../../server/src/beatmaps', () => ({}));
vi.mock('../../server/src/db/client', () => ({}));

const stats = (xp: Big) => userStatistics(
	mania4k, {
		pp: 1, overallLifetimeXp: xp, 
	} as never, {} as never, {},
).level.total_xp;

describe('API v2 on Big', () => {
	it('simulate takes absurd levels and xp', () => {
		const body = simulateBody.parse({
			beatmap_id: 1, skills: {
				speed: {
					level: 5000, xp: '1e400', prestige: 4000, 
				}, 
			},
		});
		expect(body.skills.speed?.xp.toString()).toBe('1e400');
		expect(body.skills.speed?.overdrive.toString()).toBe('0');
	});

	it('simulate refuses a malformed xp', () => {
		expect(simulateBody.safeParse({
			beatmap_id: 1, skills: {
				speed: {
					level: 1, xp: 'abc', 
				}, 
			}, 
		}).success).toBe(false);
	});

	it('total_xp is text, small or huge', () => {
		expect(stats(Big.from(123456))).toBe('123456');
		expect(stats(Big.from('1e400'))).toBe('1e400');
	});

	it('the sim wire round-trips Big', () => {
		const input = {
			checksum: 'x', rate: 1, mods: [], state: {
				generation: 1, strainMinutes: 0, mapPlays: 0, skills: {
					speed: {
						level: 5,
						xp: Big.from('1e400'),
						lifetimeXp: Big.from(7),
						prestige: 0,
						upgrades: 0,
						overdrive: Big.from(2.5),
					},
				},
			},
		};
		const back = simInputFromWire(JSON.parse(JSON.stringify(simInputToWire(input))));
		expect(back.state.skills.speed?.xp.toString()).toBe('1e400');
		expect(back.state.skills.speed?.overdrive.toString()).toBe('2.5');
	});
});

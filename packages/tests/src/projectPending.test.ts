import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { NO_GENETICS } from '@oss-idle/shared/genetics';
import Synced from '@oss-idle/shared/helpers/synced';
import { GENETICS_4K } from '@oss-idle/shared/rulesets/mania/4k/genes';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import type Character from '../../client/src/db/schema/character';
import { projectPending } from '../../client/src/online/projectPending';

vi.mock('../../client/src/rulesets/registry', () => ({
	selectedDef: () => ({ genetics: GENETICS_4K }),
	selectedRuleset: { get: () => 'mania4k' },
}));

const character = (level: number, overdrive: number) => {
	const skill = new SkillState('speed');
	void skill.level.set(level);
	void skill.upgrades.set(10);
	void skill.overdrive.set(overdrive);
	return {
		skills: [skill], genetics: new Synced(NO_GENETICS),
	} as unknown as Character;
};

describe('projectPending', () => {
	it('shows the climaxx a parked prestige grants', () => {
		const c = character(100, 3);
		projectPending(c, [{
			type: 'prestige', ruleset: 'mania4k', skill: 'speed', requestedAt: 1,
		}]);
		expect(c.skills[0]!.prestige.get()).toBe(1);
		expect(c.genetics.get().converted.speed).toBeGreaterThan(0);
	});

	it('grants none for a forced prestige', () => {
		const c = character(50, 3);
		projectPending(c, [{
			type: 'prestige', ruleset: 'mania4k', skill: 'speed', force: true, requestedAt: 1,
		}]);
		expect(c.genetics.get().converted.speed).toBeUndefined();
	});

	it('leaves another ruleset alone', () => {
		const c = character(100, 3);
		projectPending(c, [{
			type: 'prestige', ruleset: 'mania7k', skill: 'speed', requestedAt: 1,
		}]);
		expect(c.skills[0]!.prestige.get()).toBe(0);
	});
});

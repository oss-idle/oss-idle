import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	type Anchor,
	skillsAt,
	windowsOf,
} from '../../server/src/db/reprocess/state';

// [level, xp, upgrades, overdrive, prestige, lifetime xp]
const anchor = (
	maxScoreId: number, speed: number[], stamina = [0, 0, 0, 0, 0, 0], fatigue = true,
): Anchor => ({
	maxScoreId, fatigue, profile: {
		skills: {
			speed, stamina, 
		}, 
	},
});
const skills = ['speed', 'stamina'];
const discrete = (skill: string, field: string) =>
	field === 'prestige' || (field === 'upgrades' && skill === 'stamina');

describe('score reprocessing state', () => {
	it('groups plays by the dumps around them', () => {
		const anchors = [anchor(10, [0, 0, 0, 0, 0, 0]), anchor(20, [0, 0, 0, 0, 0, 0])];
		const windows = windowsOf(anchors, [{ id: 3 }, { id: 11 }, { id: 20 }]);
		expect(windows.map(w => [w.start?.maxScoreId, w.end.maxScoreId, w.plays.map(p => p.id)]))
			.toEqual([[undefined, 10, [3]], [10, 20, [11, 20]]]);
		expect(() => windowsOf(anchors, [{ id: 21 }])).toThrow();
	});

	it('spreads lifetime xp over the window and knows the held level', () => {
		const start = anchor(10, [5, 0, 0, 0, 0, 1000]);
		const at = skillsAt(start, anchor(20, [9, 0, 0, 0, 0, 3000]), 0.25, skills, discrete);
		expect(at.ambiguous).toBe(false);
		expect(at.progress.speed.lifetimeXp).toBe(1500);
		expect(at.old?.speed.level).toBeGreaterThanOrEqual(5);
	});

	it('is ambiguous when something the sim reads moved', () => {
		const start = anchor(10, [5, 0, 0, 0, 0, 1000]);
		const prestiged = skillsAt(start, anchor(20, [0, 0, 0, 0, 1, 3000]), 0.75, skills, discrete);
		expect(prestiged.ambiguous).toBe(true);
		// past halfway, the later dump's prestige
		expect(prestiged.progress.speed.prestige).toBe(1);
		expect(prestiged.old).toBeUndefined();

		// gear the sim doesn't read leaves it exact for the new sim, not the old
		const geared = skillsAt(start, anchor(20, [5, 0, 2, 0, 0, 3000]), 0.5, skills, discrete);
		expect(geared.ambiguous).toBe(false);
		expect(geared.old).toBeUndefined();

		const ambiguous = (from: Anchor | undefined, to: Anchor) =>
			skillsAt(from, to, 0.5, skills, discrete).ambiguous;
		// warm-up gear
		expect(ambiguous(start, anchor(20, [5, 0, 0, 0, 0, 3000], [0, 0, 1, 0, 0, 0]))).toBe(true);
		// before the first dump, at the first skills known after it
		expect(ambiguous(undefined, start)).toBe(true);
		expect(skillsAt(undefined, start, 0.1, skills, discrete).progress.speed.lifetimeXp).toBe(1000);
		// fatigue went live in between
		const cold = anchor(10, [5, 0, 0, 0, 0, 1000], undefined, false);
		expect(ambiguous(cold, anchor(20, [5, 0, 0, 0, 0, 3000]))).toBe(true);
		// a rollback between the dumps
		expect(ambiguous(start, anchor(20, [5, 0, 0, 0, 0, 500]))).toBe(true);
	});
});

import {
	describe,
	expect,
	it,
} from 'vitest';

import { SKILL } from '@oss-idle/shared/rulesets/mania/4k/skills';
import Accuracy from '@oss-idle/shared/rulesets/mania/4k/skills/accuracy';
import Consistency from '@oss-idle/shared/rulesets/mania/4k/skills/consistency';
import Coordination from '@oss-idle/shared/rulesets/mania/4k/skills/coordination';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import Memory from '@oss-idle/shared/rulesets/mania/4k/skills/memory';
import type Skill from '@oss-idle/shared/rulesets/mania/4k/skills/skill';
import {
	LATE_LEVEL_XP,
	lateLevelXp,
	xpForLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

describe('xpForLevel curve', () => {
	it('costs exactly 100 to leave level 0', () => {
		expect(xpForLevel(0)).toBe(100);
	});

	it('is strictly increasing across the level range', () => {
		for (let level = 1; level <= 120; level++) {
			expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
		}
	});

	it('grows the endgame tier by a whole step each level, harder again every 10 levels', () => {
		expect(lateLevelXp(99)).toBe(0);
		expect([100, 101, 102, 103, 104].map(lateLevelXp))
			.toEqual([1, 3, 6, 10, 15].map(n => n * LATE_LEVEL_XP));
		// the whole-step cost, times one factor per 10 levels past 100
		const factor = (level: number) =>
			lateLevelXp(level) / ((level - 99) * (level - 98) / 2 * LATE_LEVEL_XP);
		for (let level = 100; level < 140; level++) {
			expect(factor(level)).toBeCloseTo(factor(level - (level - 100) % 10), 10);
		}
		expect(factor(100)).toBe(1);
		expect(factor(110)).toBeGreaterThan(1);
		expect(factor(120)).toBeCloseTo(factor(110) ** 2, 10);
		expect(factor(130)).toBeCloseTo(factor(110) ** 3, 10);
	});
});

describe('Skill.gainXP', () => {
	it('levels up once when xp crosses the threshold, carrying the remainder', () => {
		const skill = makeOrderedSkills().find(s => s.name === SKILL.accuracy) as Accuracy;
		const gained = skill.gainXP(xpForLevel(0) + 1); // 101
		expect(gained).toBe(1);
		expect(skill.level.get()).toBe(1);
		expect(skill.xp.get()).toBeCloseTo(1, 10);
	});

	// TODO fix this is bullshit
	it('does NOT level up at exactly the threshold (strict >)', () => {
		const skill = makeOrderedSkills().find(s => s.name === SKILL.accuracy) as Accuracy;
		const gained = skill.gainXP(xpForLevel(0)); // exactly 100
		expect(gained).toBe(0);
		expect(skill.level.get()).toBe(0);
		expect(skill.xp.get()).toBe(xpForLevel(0));
	});

	it('cascades through several levels from a single large grant', () => {
		const skill = makeOrderedSkills().find(s => s.name === SKILL.accuracy) as Accuracy;
		const cost = xpForLevel(0) + xpForLevel(1) + xpForLevel(2);
		const gained = skill.gainXP(cost + 1);
		expect(gained).toBe(3);
		expect(skill.level.get()).toBe(3);
		expect(skill.xp.get()).toBeCloseTo(1, 6);
	});

	it('accumulates xp below the threshold without levelling', () => {
		const skill = makeOrderedSkills().find(s => s.name === SKILL.accuracy) as Accuracy;
		expect(skill.gainXP(40)).toBe(0);
		expect(skill.gainXP(40)).toBe(0);
		expect(skill.level.get()).toBe(0);
		expect(skill.xp.get()).toBeCloseTo(80, 10);
	});
});

describe('play level', () => {
	const accuracy = () => makeOrderedSkills().find(s => s.name === SKILL.accuracy) as Accuracy;

	it('is the level held, for a skill set by level alone', () => {
		const skill = accuracy();
		skill.level.set(40);
		expect(skill.playLevel()).toBe(40);
	});

	it('keeps what the lifetime bought through a prestige, plus the bonus, and climbs on', () => {
		const skill = accuracy();
		skill.apply({
			level: 0, xp: 0, upgrades: 0, overdrive: 0, prestige: 1,
		});
		skill.lifetimeXp.set(xpToLevel(100));
		expect(skill.playLevel()).toBeCloseTo(101, 6);
		skill.gainXP(xpToLevel(60));
		expect(skill.playLevel()).toBeGreaterThan(101);
		expect(skill.effectiveLevel()).toBeCloseTo(61, 6);
	});
});

describe('prestige band', () => {
	const at = (skill: Skill, prestige: number) => {
		void skill.prestige.set(prestige);
		return skill as unknown as Record<string, number>;
	};
	const skillsAt = (prestige: number) => ({
		coordination: at(new Coordination(100), prestige),
		memory: at(new Memory(100), prestige),
		consistency: at(new Consistency(100), prestige),
	});

	it('keeps coordination, memory and consistency improving past level 100', () => {
		const [a, b] = [skillsAt(40), skillsAt(200)];
		expect(b.coordination.fatigueRate).toBeLessThan(a.coordination.fatigueRate);
		expect(b.memory.maxPlays).toBeLessThan(a.memory.maxPlays);
		expect(b.memory.maxImprove).toBeGreaterThan(a.memory.maxImprove);
		expect(b.consistency.randomness).toBeLessThan(a.consistency.randomness);
	});
});

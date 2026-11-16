import { i18n } from '@lingui/core';
import {
	beforeAll,
	describe,
	expect,
	it,
} from 'vitest';

import {
	REBIRTH_UNLOCKS,
	unlocksForGeneration,
	usesReservedOld,
} from '@oss-idle/shared/rebirth';
import { upgradeLabel } from '@oss-idle/shared/rulesets/mania/4k/display';
import { UPGRADE } from '@oss-idle/shared/rulesets/mania/4k/display';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import { mapLevel } from '@oss-idle/shared/rulesets/mania/4k/skills/levelCurve';
import type Skill from '@oss-idle/shared/rulesets/mania/4k/skills/skill';
import { effectiveLevelOf } from '@oss-idle/shared/xp';
import { xpForLevel } from '@oss-idle/shared/xp';

describe('level → skill mapping', () => {
	it('is the identity up to 90', () => {
		expect(mapLevel(0)).toBe(0);
		expect(mapLevel(45)).toBe(45);
		expect(mapLevel(90)).toBe(90);
	});

	// the breakpoints are meant to be retuned, so these pin the shape the tuning
	// has to keep, not the numbers it is allowed to move
	it('only ever slows down: past 90 a level buys less than a level', () => {
		for (let l = 91; l <= 300; l++) expect(mapLevel(l), `level ${l}`).toBeLessThan(l);
	});

	it('never speeds back up', () => {
		const slope = (l: number) => mapLevel(l + 1) - mapLevel(l);
		for (let l = 91; l < 300; l++) {
			expect(slope(l), `slope at ${l}`).toBeLessThanOrEqual(slope(l - 1) + 1e-9);
		}
	});

	it('leaves an end-game character in the low 100s, not at the ceiling', () => {
		// absurd stats (effective 200+) should still land around gameplay 110-120
		expect(mapLevel(200)).toBeGreaterThanOrEqual(105);
		expect(mapLevel(200)).toBeLessThanOrEqual(125);
	});

	it('never goes backwards', () => {
		for (let l = 1; l <= 130; l++) expect(mapLevel(l)).toBeGreaterThan(mapLevel(l - 1));
	});

	it('floors at zero', () => {
		expect(mapLevel(-5)).toBe(0);
	});
});

describe('the level the player is shown', () => {
	it('is the xp level, its progress and the prestige bonus - not the mapping', () => {
		// the spec keeps the display on real levels: 102.45 + 2 reads 104.45
		expect(effectiveLevelOf(102, xpForLevel(102).toNumber() * 0.45, 2)).toBeCloseTo(104.45, 2);
	});

	it('leaves the strain mapping out of it entirely', () => {
		// the curves see a compressed 104; the player still sees 104
		expect(effectiveLevelOf(104, 0, 0)).toBe(104);
		expect(mapLevel(104)).toBeLessThan(104);
	});

	it('counts a prestige bonus level as a real one', () => {
		expect(effectiveLevelOf(100, 0, 5)).toBe(effectiveLevelOf(105, 0, 0));
	});
});

describe('the level the strain curves read', () => {
	// the rates a skill caches off its level: its own number fields
	const rates = (skill: Skill): number[] =>
		Object.entries(skill)
			.filter(([, v]) => typeof v === 'number')
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, v]) => v as number);

	const ratesAt = (skill: Skill, level: number, progress: number): number[] => {
		skill.level.set(level);
		skill.xp.set(xpForLevel(level).mul(progress));
		return rates(skill);
	};

	it('is the effective level - earned, progress and prestige', () => {
		const skill = makeOrderedSkills()[0]!;
		skill.level.set(50);
		skill.xp.set(xpForLevel(50).mul(0.5));
		skill.prestige.set(3);
		expect(skill.effectiveLevel()).toBeCloseTo(53.5, 6);
	});

	it('never reads past the level the xp is about to buy', () => {
		const skill = makeOrderedSkills()[0]!;
		skill.level.set(50);
		skill.xp.set(xpForLevel(50).mul(4));
		expect(skill.effectiveLevel()).toBe(51);
	});

	it('moves every skill\'s rates as xp is banked, not only on a level up', () => {
		for (const skill of makeOrderedSkills()) {
			const low = ratesAt(skill, 50, 0);
			const mid = ratesAt(skill, 50, 0.5);
			const high = ratesAt(skill, 51, 0);

			expect(low.length, `${skill.name} caches no rate`).toBeGreaterThan(0);
			expect(mid, `${skill.name} ignores its level progress`).not.toEqual(low);
			// half a level in sits between the two levels, on every rate
			mid.forEach((v, i) => {
				const a = low[i]!;
				const b = high[i]!;
				if (a === b) return;
				expect(v, `${skill.name} rate ${i}`).toBeGreaterThan(Math.min(a, b));
				expect(v, `${skill.name} rate ${i}`).toBeLessThan(Math.max(a, b));
			});
		}
	});
});

describe('rebirth unlocks', () => {
	it('gives a generation the first generation - 1 unlocks', () => {
		expect(unlocksForGeneration(1)).toEqual([]);
		expect(unlocksForGeneration(2)).toEqual([REBIRTH_UNLOCKS[0]]);
	});

	it('starts with the divine judge', () => {
		expect(REBIRTH_UNLOCKS[0]).toBe('DIVINE');
	});
});

describe('_old is reserved', () => {
	it('rejects a chosen name carrying the token', () => {
		expect(usesReservedOld('Adri_old', 'Adri')).toBe(true);
		expect(usesReservedOld('adri_OLD', 'Adri')).toBe(true);
	});

	it('allows it when the osu! username has it', () => {
		expect(usesReservedOld('Adri_old', 'Adri_old')).toBe(false);
	});

	it('leaves ordinary names alone', () => {
		expect(usesReservedOld('Adri', 'Adri')).toBe(false);
	});
});

describe('gear tiers', () => {
	// the labels go through the runtime translator, which needs a live locale
	beforeAll(() => i18n.loadAndActivate({
		locale: 'en', messages: {},
	}));

	it('repeats the final name with a tier past the base ladder', () => {
		const ladder = UPGRADE.accuracy;
		const top = ladder.length - 1;
		const last = upgradeLabel('accuracy', top);
		// the ladder's final gear is itself Tier I, so the first extra slot is II
		expect(upgradeLabel('accuracy', top + 1)).toBe(`${last} Tier II`);
		expect(upgradeLabel('accuracy', top + 2)).toBe(`${last} Tier III`);
	});

	it('keeps climbing the number for numeric gear instead', () => {
		// speed steps by 2 (16..36), reading by its own last step (360 → 540)
		expect(upgradeLabel('speed', 10)).toBe('36 Scroll Speed');
		expect(upgradeLabel('speed', 11)).toBe('38 Scroll Speed');
		expect(upgradeLabel('reading', 11)).toBe('720hz Monitor');
	});
});

/** Every rate a skill derived from its level, so a test can tell two skills of
 *  the same class apart without reaching for their field names. */
const rates = (skill: Skill): Record<string, number> => Object.fromEntries(
	Object.entries(skill).filter(([, v]) => typeof v === 'number'),
);

const skillsAt = (level: number, prestige = 0): Skill[] => {
	const skills = makeOrderedSkills();
	for (const skill of skills) {
		skill.level.set(level);
		skill.prestige.set(prestige);
	}
	return skills;
};

describe('level curves stay in range across the mapped band', () => {
	// A rate of zero makes the relaxation step a no-op and strain freezes; a
	// negative one drives strain away from its target and inverts the gate.
	// Stamina derived fatigue from recovery and crossed zero at mapped 110.
	it('keeps every accumulator rate above zero up to the top of the bands', () => {
		// well past any reachable character: the mapping compresses hard, so it
		// takes a big effective level to push the curves into their high band
		for (let level = 0; level <= 300; level++) {
			for (const skill of skillsAt(level)) {
				for (const [name, value] of Object.entries(rates(skill))) {
					if (!name.endsWith('Rate')) continue;
					expect(value, `${skill.name}.${name} at level ${level}`)
						.toBeGreaterThan(0);
				}
			}
		}
	});
});

describe('skills read the mapped, prestige-boosted level', () => {
	it('gives a prestiged skill the rates of the level it maps to', () => {
		const prestiged = skillsAt(100, 5);
		const plain = skillsAt(105);
		prestiged.forEach((skill, i) => {
			expect(rates(skill), skill.name).toEqual(rates(plain[i]!));
		});
	});

	it('leaves the raw level behind: the bonus levels change the rates', () => {
		const before = skillsAt(100);
		const after = skillsAt(100, 5);
		const changed = after.filter((skill, i) =>
			JSON.stringify(rates(skill)) !== JSON.stringify(rates(before[i]!)));
		expect(changed.length).toBeGreaterThan(0);
	});
});

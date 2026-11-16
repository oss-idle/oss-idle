import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	Big,
	toText,
	ZERO,
} from '@oss-idle/shared/big';
import {
	applyUpgrade,
	prestigeXPMultiplier,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';
import { xpToLevel } from '@oss-idle/shared/xp';

import { apiSkill } from '../../server/src/api/skill';

describe('apiSkill', () => {
	it('gives the level a skill plays at and the XP level it holds now', () => {
		// reached level 20 once, holds level 14 since its upgrades, prestiged once
		const skill = apiSkill({
			level: 14, xp: ZERO, lifetimeXp: xpToLevel(20).add(1), prestige: 1, upgrades: 2,
			overdrive: Big.from(3),
		});
		expect(skill).toMatchObject({
			level: 21, progress: 0, lifetime_level: 20, xp_level: 14, xp: '0',
			total_xp: toText(xpToLevel(20).add(1)), prestige: 1, upgrades: 2, overdrive: '3',
		});
		expect(skill.climaxx).toBeUndefined();
	});

	it('gives what the next upgrade would add to overdrive, genes included', () => {
		const held = {
			level: 40, xp: ZERO, lifetimeXp: xpToLevel(40), prestige: 0, upgrades: 0, overdrive: Big.from(3),
		};
		const gain = applyUpgrade(held).overdrive.sub(3).toNumber();
		expect(gain).toBeGreaterThan(1);
		expect(Number(apiSkill(held).upgrade_overdrive)).toBeCloseTo(gain);
		expect(Number(apiSkill(held, { overdriveBonus: 0.5 }).upgrade_overdrive)).toBeCloseTo(gain * 1.5);
		// bought at the level it needs: nothing overspent
		expect(apiSkill({
			...held, level: 10, 
		}).upgrade_overdrive).toBe('0');
		expect(apiSkill({
			...held, level: 9, 
		}).upgrade_overdrive).toBeUndefined();
	});

	it('gives everything its XP gains are multiplied by, and the climaxx it holds', () => {
		const held = {
			level: 30, xp: Big.from(500), lifetimeXp: xpToLevel(30).add(500), prestige: 2, upgrades: 3,
			overdrive: Big.from(4),
		};
		const upgrades = upgradeXPMultiplier(3, 4);
		const prestige = prestigeXPMultiplier(2);
		// a ruleset without genetics, a character without medals
		expect(apiSkill(held).xp_multipliers).toEqual({
			upgrades: toText(upgrades), prestige: toText(prestige), genetics: undefined, medals: '1',
			total: toText(upgrades.mul(prestige)),
		});
		const full = apiSkill(held, {
			medals: 1.2, geneticsXp: 1.15, climaxx: Big.from(126),
		});
		expect(full.xp).toBe('500');
		expect(full.climaxx).toBe('126');
		expect(Number(full.xp_multipliers.total))
			.toBeCloseTo(upgrades.mul(prestige).toNumber() * 1.15 * 1.2);
		expect(full.xp_multipliers).toMatchObject({
			genetics: '1.15', medals: '1.2',
		});
	});
});

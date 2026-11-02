import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	applyPrestige,
	applyUpgrade,
	BASE_MAX_UPGRADES,
	canPrestige,
	canRebirth,
	canUpgrade,
	GEAR_TIER_LEVELS,
	maxUpgrades,
	overdriveMultiplier,
	PRESTIGE_XP_BONUS,
	prestigeMinLevel,
	prestigeXPMultiplier,
	REBIRTH_MIN_OVERALL_LEVEL,
	revertUpgrade,
	skillXPMultiplier,
	UPGRADE_LEVELS,
	UPGRADE_XP_BONUS,
	upgradeCost,
	upgradeMinLevel,
	upgradeMinSpend,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';
import {
	xpForLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

const fresh = {
	upgrades: 0, overdrive: 0, prestige: 0,
};

describe('upgrade cost', () => {
	it('requires the level ladder to climb by UPGRADE_LEVELS per purchase', () => {
		expect(upgradeMinLevel(0)).toBe(UPGRADE_LEVELS);
		expect(upgradeMinLevel(1)).toBe(2 * UPGRADE_LEVELS);
	});

	it('min spend is the XP of the levels right below the requirement', () => {
		expect(upgradeMinSpend(0)).toBe(xpToLevel(UPGRADE_LEVELS));
		expect(upgradeMinSpend(1))
			.toBe(xpToLevel(2 * UPGRADE_LEVELS) - xpToLevel(UPGRADE_LEVELS));
	});

	it('is not purchasable below the required level', () => {
		expect(canUpgrade({
			level: UPGRADE_LEVELS - 1, upgrades: 0, prestige: 0,
		})).toBe(false);
		expect(canUpgrade({
			level: UPGRADE_LEVELS, upgrades: 0, prestige: 0,
		})).toBe(true);
	});

	it('is capped at the base ladder without prestige', () => {
		expect(canUpgrade({
			level: 100, upgrades: BASE_MAX_UPGRADES, prestige: 0,
		})).toBe(false);
	});

	it('each prestige grants one more slot', () => {
		expect(maxUpgrades(0)).toBe(BASE_MAX_UPGRADES);
		expect(maxUpgrades(3)).toBe(BASE_MAX_UPGRADES + 3);
	});

	it('a gear tier costs the one level it stepped up by', () => {
		expect(upgradeCost(0)).toBe(UPGRADE_LEVELS);
		expect(upgradeCost(BASE_MAX_UPGRADES - 1)).toBe(UPGRADE_LEVELS);
		expect(upgradeCost(BASE_MAX_UPGRADES)).toBe(GEAR_TIER_LEVELS);
		expect(upgradeCost(BASE_MAX_UPGRADES + 3)).toBe(GEAR_TIER_LEVELS);
	});

	it('spends only that cost when a tier is bought', () => {
		const p = applyUpgrade({
			level: 101, xp: 0, upgrades: BASE_MAX_UPGRADES, overdrive: 0, prestige: 1,
		});
		expect(p.level).toBe(100);
		expect(p.upgrades).toBe(BASE_MAX_UPGRADES + 1);
	});

	it('gear tiers step by one level, landing on the prestige that granted them', () => {
		// the base ladder is untouched
		expect(upgradeMinLevel(BASE_MAX_UPGRADES - 1)).toBe(BASE_MAX_UPGRADES * UPGRADE_LEVELS);
		// the first tier lands one level above it, not ten
		expect(upgradeMinLevel(BASE_MAX_UPGRADES))
			.toBe(BASE_MAX_UPGRADES * UPGRADE_LEVELS + GEAR_TIER_LEVELS);
		// after n prestiges the last slot needs the same level as prestige n+1
		for (let n = 1; n <= 5; n++)
			expect(upgradeMinLevel(maxUpgrades(n) - 1)).toBe(prestigeMinLevel(n));
	});
});

describe('prestige', () => {
	it('needs real level 100, one more per prestige taken', () => {
		expect(prestigeMinLevel(0)).toBe(100);
		expect(prestigeMinLevel(1)).toBe(101);
		expect(canPrestige({
			level: 99, prestige: 0,
		})).toBe(false);
		expect(canPrestige({
			level: 100, prestige: 0,
		})).toBe(true);
		expect(canPrestige({
			level: 100, prestige: 1,
		})).toBe(false);
	});

	it('wipes level, xp, upgrades and overdrive, and counts up', () => {
		const p = applyPrestige({
			level: 100, xp: 500, upgrades: 7, overdrive: 3.5, prestige: 0,
		});
		expect(p).toEqual({
			level: 0, xp: 0, upgrades: 0, overdrive: 0, prestige: 1,
			spent: xpToLevel(100) + 500,
		});
	});

	it('charges the overall level for everything the reset undid', () => {
		// the caller takes `spent` off the running totals, so prestiging every
		// skill walks the character back down instead of leaving it at the top
		const p = applyPrestige({
			level: 100, xp: 0, upgrades: 10, overdrive: 5, prestige: 0,
		});
		expect(p.spent).toBeCloseTo(xpToLevel(100), 5);

		// the xp banked inside the level goes with the level
		const part = applyPrestige({
			level: 100, xp: 5000, upgrades: 10, overdrive: 5, prestige: 0,
		});
		expect(part.spent).toBeCloseTo(xpToLevel(100) + 5000, 5);
	});

	it('refuses below the requirement', () => {
		expect(() => applyPrestige({
			level: 99, xp: 0, ...fresh,
		})).toThrow();
	});

	it('multiplies its own pool on top of the upgrade bonus', () => {
		expect(prestigeXPMultiplier(0)).toBe(1);
		expect(prestigeXPMultiplier(2)).toBeCloseTo(Math.pow(1 + PRESTIGE_XP_BONUS, 2), 10);
		expect(skillXPMultiplier(3, 5, 2))
			.toBeCloseTo(upgradeXPMultiplier(3, 5) * prestigeXPMultiplier(2), 10);
	});
});

describe('rebirth', () => {
	it('unlocks on overall level, not a per-skill one', () => {
		expect(canRebirth(REBIRTH_MIN_OVERALL_LEVEL - 1, 1)).toBe(false);
		expect(canRebirth(REBIRTH_MIN_OVERALL_LEVEL, 1)).toBe(true);
	});
	it('each generation needs 10 more levels', () => {
		expect(canRebirth(119, 2)).toBe(false);
		expect(canRebirth(120, 2)).toBe(true);
		expect(canRebirth(129, 3)).toBe(false);
		expect(canRebirth(130, 3)).toBe(true);
	});
});

describe('applyUpgrade', () => {
	it('buying exactly at the minimum drains to level 0 with no overdrive', () => {
		const p = applyUpgrade({
			level: UPGRADE_LEVELS, xp: 0, ...fresh,
		});
		expect(p.level).toBe(0);
		expect(p.xp).toBe(0);
		expect(p.upgrades).toBe(1);
		expect(p.spent).toBe(upgradeMinSpend(0));
		expect(p.ratio).toBe(1);
		expect(p.overdrive).toBe(0);
	});

	it('spends the top UPGRADE_LEVELS levels, keeping the partial fraction (Lv15 → Lv5)', () => {
		const from = UPGRADE_LEVELS + 5;
		const p = applyUpgrade({
			level: from, xp: 50, ...fresh,
		});
		expect(p.level).toBe(5);
		expect(p.xp / xpForLevel(5)).toBeCloseTo(50 / xpForLevel(from), 10);
		// the shrunk partial counts as spent: the absolute XP delta
		expect(p.spent)
			.toBeCloseTo(xpToLevel(from) + 50 - xpToLevel(5) - p.xp, 6);
	});

	it('drops exactly UPGRADE_LEVELS even past level 100 (Lv100.2 → Lv90.2)', () => {
		// A Lv100 partial is worth whole low levels in absolute XP - the level
		// must still land exactly UPGRADE_LEVELS lower, fraction preserved.
		const xp = xpForLevel(100) * 0.2;
		const p = applyUpgrade({
			level: 100, xp, ...fresh,
		});
		expect(p.level).toBe(100 - UPGRADE_LEVELS);
		expect(p.xp / xpForLevel(p.level)).toBeCloseTo(0.2, 10);
	});

	it('overspending feeds overdrive with the spend ratio', () => {
		const level = 3 * UPGRADE_LEVELS;
		const p = applyUpgrade({
			level, xp: 0, ...fresh,
		});
		const ratio = (xpToLevel(level) - xpToLevel(level - UPGRADE_LEVELS)) / upgradeMinSpend(0);
		expect(ratio).toBeGreaterThan(1);
		expect(p.ratio).toBeCloseTo(ratio, 10);
		expect(p.overdrive).toBeCloseTo(ratio, 10);
	});

	it('refuses an unaffordable purchase', () => {
		expect(() => applyUpgrade({
			level: UPGRADE_LEVELS - 1, xp: 0, ...fresh,
		})).toThrow();
	});
});

describe('overdrive & XP multiplier', () => {
	it('is floored at x1 and a true multiplier while small', () => {
		expect(overdriveMultiplier(0)).toBe(1);
		expect(overdriveMultiplier(1)).toBe(1);
		expect(overdriveMultiplier(2)).toBe(2);
	});

	it('maps large raw overdrive degressively (x10 → x5, x100 → x10, x1000 → x20)', () => {
		expect(overdriveMultiplier(10)).toBeCloseTo(5, 10);
		expect(overdriveMultiplier(100)).toBeCloseTo(10, 10);
		expect(overdriveMultiplier(1000)).toBeCloseTo(20, 10);
	});

	it('multiplies the additive upgrade bonus, not the whole XP', () => {
		expect(upgradeXPMultiplier(0, 0)).toBe(1);
		expect(upgradeXPMultiplier(1, 0)).toBeCloseTo(1 + UPGRADE_XP_BONUS, 10);
		expect(upgradeXPMultiplier(1, 5))
			.toBeCloseTo(1 + UPGRADE_XP_BONUS * overdriveMultiplier(5), 10);
		expect(upgradeXPMultiplier(2, 5))
			.toBeCloseTo(1 + 2 * UPGRADE_XP_BONUS * overdriveMultiplier(5), 10);
	});
});

describe('upgrade rollback', () => {
	it('undoes two upgrades bought in a row', () => {
		const start = {
			level: 104, xp: 1234, upgrades: 7, overdrive: 0.5, prestige: 0,
		};
		const once = applyUpgrade(start);
		const twice = applyUpgrade(once);
		const back = revertUpgrade(revertUpgrade(twice));
		expect(twice.level).toBe(84);
		expect(back.level).toBe(104);
		expect(back.upgrades).toBe(7);
		expect(back.xp).toBeCloseTo(1234);
		expect(back.overdrive).toBeCloseTo(0.5);
		expect(revertUpgrade(once).refund).toBeCloseTo(once.spent);
	});

	it('refunds the levels as they were worth at the anchor', () => {
		const state = {
			level: 100, xp: 0, upgrades: 8, overdrive: 0, prestige: 0,
		};
		const prev = revertUpgrade(state, 84);
		expect(prev.refund).toBeCloseTo(xpToLevel(94) - xpToLevel(84));
		expect(prev.level).toBe(100);
		expect(prev.xp).toBeCloseTo(xpToLevel(94) - xpToLevel(84));
		expect(revertUpgrade(state).level).toBe(110);
	});

	it('refunds a gear tier its single level', () => {
		const state = {
			level: 102, xp: 0, upgrades: BASE_MAX_UPGRADES + 1, overdrive: 0, prestige: 2,
		};
		expect(revertUpgrade(state).level).toBe(102 + GEAR_TIER_LEVELS);
	});
});

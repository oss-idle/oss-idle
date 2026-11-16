import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
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
	prestigeOverdrive,
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
	heldTotal,
	xpForLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

const fresh = {
	upgrades: 0, overdrive: Big.from(0), prestige: 0,
};
const B = (n: number) => Big.from(n);

describe('upgrade cost', () => {
	it('requires the level ladder to climb by UPGRADE_LEVELS per purchase', () => {
		expect(upgradeMinLevel(0)).toBe(UPGRADE_LEVELS);
		expect(upgradeMinLevel(1)).toBe(2 * UPGRADE_LEVELS);
	});

	it('min spend is the XP of the levels right below the requirement', () => {
		expect(upgradeMinSpend(0).toNumber()).toBe(xpToLevel(UPGRADE_LEVELS).toNumber());
		expect(upgradeMinSpend(1).toNumber())
			.toBe(xpToLevel(2 * UPGRADE_LEVELS).toNumber() - xpToLevel(UPGRADE_LEVELS).toNumber());
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
			level: 101, xp: B(0), upgrades: BASE_MAX_UPGRADES, overdrive: B(0), prestige: 1,
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
			level: 100, xp: B(500), upgrades: 7, overdrive: B(3.5), prestige: 0,
		});
		expect(p.spent.toNumber()).toBe(xpToLevel(100).toNumber() + 500);
		expect({
			...p, spent: undefined,
		}).toEqual({
			level: 0, xp: B(0), upgrades: 0, overdrive: B(0), prestige: 1, spent: undefined,
		});
	});

	it('charges the overall level for everything the reset undid', () => {
		// the caller takes `spent` off the running totals, so prestiging every
		// skill walks the character back down instead of leaving it at the top
		const p = applyPrestige({
			level: 100, xp: B(0), upgrades: 10, overdrive: B(5), prestige: 0,
		});
		expect(p.spent.toNumber()).toBeCloseTo(xpToLevel(100).toNumber(), 5);

		// the xp banked inside the level goes with the level
		const part = applyPrestige({
			level: 100, xp: B(5000), upgrades: 10, overdrive: B(5), prestige: 0,
		});
		expect(part.spent.toNumber()).toBeCloseTo(xpToLevel(100).toNumber() + 5000, 5);
	});

	it('converts the overdrive the next upgrade would add, without buying it', () => {
		const ready = {
			level: 120, xp: B(0), upgrades: 9, overdrive: B(2), prestige: 0,
		};
		expect(prestigeOverdrive(ready, 0.5).eq(applyUpgrade(ready, 0.5).overdrive)).toBe(true);
		expect(prestigeOverdrive(ready).gt(2)).toBe(true);
		expect(prestigeOverdrive({
			...ready, upgrades: maxUpgrades(0),
		}).toNumber()).toBe(2);
	});

	it('refuses below the requirement', () => {
		expect(() => applyPrestige({
			level: 99, xp: B(0), ...fresh,
		})).toThrow();
	});

	it('forced below the requirement, wipes the same without counting up', () => {
		const forced = applyPrestige({
			level: 60, xp: B(500), upgrades: 7, overdrive: B(3.5), prestige: 2,
		}, true);
		expect(forced.spent.toNumber()).toBe(xpToLevel(60).toNumber() + 500);
		expect({
			...forced, spent: undefined,
		}).toEqual({
			level: 0, xp: B(0), upgrades: 0, overdrive: B(0), prestige: 2, spent: undefined,
		});
		expect(applyPrestige({
			level: 100, xp: B(0), ...fresh,
		}, true).prestige).toBe(1);
	});

	it('multiplies its own pool on top of the upgrade bonus', () => {
		expect(prestigeXPMultiplier(0).toNumber()).toBe(1);
		expect(prestigeXPMultiplier(2).toNumber()).toBeCloseTo(Math.pow(1 + PRESTIGE_XP_BONUS, 2), 10);
		expect(skillXPMultiplier(3, 5, 2).toNumber())
			.toBeCloseTo(upgradeXPMultiplier(3, 5).toNumber() * prestigeXPMultiplier(2).toNumber(), 10);
		expect(prestigeXPMultiplier(7500).log10()).toBeCloseTo(7500 * Math.log10(1.1), 9);
		expect(skillXPMultiplier(30, Big.from('1e300'), 8000).gt(0)).toBe(true);
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
			level: UPGRADE_LEVELS, xp: B(0), ...fresh,
		});
		expect(p.level).toBe(0);
		expect(p.xp.toNumber()).toBe(0);
		expect(p.upgrades).toBe(1);
		expect(p.spent.toNumber()).toBe(upgradeMinSpend(0).toNumber());
		expect(p.ratio.toNumber()).toBe(1);
		expect(p.overdrive.toNumber()).toBe(0);
	});

	it('spends the top UPGRADE_LEVELS levels, keeping the partial fraction (Lv15 → Lv5)', () => {
		const from = UPGRADE_LEVELS + 5;
		const p = applyUpgrade({
			level: from, xp: B(50), ...fresh,
		});
		expect(p.level).toBe(5);
		expect(p.xp.toNumber() / xpForLevel(5).toNumber())
			.toBeCloseTo(50 / xpForLevel(from).toNumber(), 10);
		// the shrunk partial counts as spent: the absolute XP delta
		expect(p.spent.toNumber())
			.toBeCloseTo(xpToLevel(from).toNumber() + 50 - xpToLevel(5).toNumber() - p.xp.toNumber(), 6);
	});

	it('drops exactly UPGRADE_LEVELS even past level 100 (Lv100.2 → Lv90.2)', () => {
		// A Lv100 partial is worth whole low levels in absolute XP - the level
		// must still land exactly UPGRADE_LEVELS lower, fraction preserved.
		const xp = xpForLevel(100).toNumber() * 0.2;
		const p = applyUpgrade({
			level: 100, xp: B(xp), ...fresh,
		});
		expect(p.level).toBe(100 - UPGRADE_LEVELS);
		expect(p.xp.toNumber() / xpForLevel(p.level).toNumber()).toBeCloseTo(0.2, 10);
	});

	it('overspending feeds overdrive with the spend ratio', () => {
		const level = 3 * UPGRADE_LEVELS;
		const p = applyUpgrade({
			level, xp: B(0), ...fresh,
		});
		const spend = xpToLevel(level).toNumber() - xpToLevel(level - UPGRADE_LEVELS).toNumber();
		const ratio = spend / upgradeMinSpend(0).toNumber();
		expect(ratio).toBeGreaterThan(1);
		expect(p.ratio.toNumber()).toBeCloseTo(ratio, 10);
		expect(p.overdrive.toNumber()).toBeCloseTo(ratio, 10);
	});

	it('refuses an unaffordable purchase', () => {
		expect(() => applyUpgrade({
			level: UPGRADE_LEVELS - 1, xp: B(0), ...fresh,
		})).toThrow();
	});
});

describe('overdrive & XP multiplier', () => {
	it('is floored at x1 and a true multiplier while small', () => {
		expect(overdriveMultiplier(0).toNumber()).toBe(1);
		expect(overdriveMultiplier(1).toNumber()).toBe(1);
		expect(overdriveMultiplier(2).toNumber()).toBe(2);
	});

	it('maps large raw overdrive degressively (x10 → x5, x100 → x10, x1000 → x20)', () => {
		expect(overdriveMultiplier(10).toNumber()).toBeCloseTo(5, 10);
		expect(overdriveMultiplier(100).toNumber()).toBeCloseTo(10, 10);
		expect(overdriveMultiplier(1000).toNumber()).toBeCloseTo(20, 10);
	});

	it('multiplies the additive upgrade bonus, not the whole XP', () => {
		expect(upgradeXPMultiplier(0, 0).toNumber()).toBe(1);
		expect(upgradeXPMultiplier(1, 0).toNumber()).toBeCloseTo(1 + UPGRADE_XP_BONUS, 10);
		expect(upgradeXPMultiplier(1, 5).toNumber())
			.toBeCloseTo(1 + UPGRADE_XP_BONUS * overdriveMultiplier(5).toNumber(), 10);
		expect(upgradeXPMultiplier(2, 5).toNumber())
			.toBeCloseTo(1 + 2 * UPGRADE_XP_BONUS * overdriveMultiplier(5).toNumber(), 10);
	});
});

describe('upgrade rollback', () => {
	it('undoes two upgrades bought in a row', () => {
		const start = {
			level: 104, xp: B(1234), upgrades: 7, overdrive: B(0.5), prestige: 0,
		};
		const once = applyUpgrade(start);
		const twice = applyUpgrade(once);
		const back = revertUpgrade(revertUpgrade(twice));
		expect(twice.level).toBe(84);
		expect(back.level).toBe(104);
		expect(back.upgrades).toBe(7);
		expect(back.xp.toNumber()).toBeCloseTo(1234);
		expect(back.overdrive.toNumber()).toBeCloseTo(0.5);
		expect(revertUpgrade(once).refund.toNumber()).toBeCloseTo(once.spent.toNumber());
	});

	it('refunds the levels as they were worth at the anchor', () => {
		const state = {
			level: 100, xp: B(0), upgrades: 8, overdrive: B(0), prestige: 0,
		};
		const prev = revertUpgrade(state, 84);
		expect(prev.refund.toNumber()).toBeCloseTo(xpToLevel(94).toNumber() - xpToLevel(84).toNumber());
		expect(prev.level).toBe(100);
		expect(prev.xp.toNumber()).toBeCloseTo(xpToLevel(94).toNumber() - xpToLevel(84).toNumber());
		expect(revertUpgrade(state).level).toBe(110);
	});

	it('refunds a gear tier its single level', () => {
		const state = {
			level: 102, xp: B(0), upgrades: BASE_MAX_UPGRADES + 1, overdrive: B(0), prestige: 2,
		};
		expect(revertUpgrade(state).level).toBe(102 + GEAR_TIER_LEVELS);
	});
});

describe('past 1e300', () => {
	it('keeps what a purchase spends and holds', () => {
		const xp = xpForLevel(5000).div(3);
		const p = applyUpgrade({
			level: 5000, xp, upgrades: 500, overdrive: Big.from('1e40'), prestige: 4900,
		});
		const diff = heldTotal(p.level, p.xp).add(p.spent).sub(heldTotal(5000, xp)).abs();
		expect(diff.log10()).toBeLessThan(heldTotal(5000, 0).log10() - 12);
	});
});

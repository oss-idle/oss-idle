import { z } from 'zod';

import {
	xpForLevel,
	xpToLevel,
} from './xp.js';

export const UPGRADE_LEVELS = 10;
/** Slots on the base gear ladder, before any prestige. */
export const BASE_MAX_UPGRADES = 10;
/** Extra slots a prestige grants on that skill. */
export const UPGRADES_PER_PRESTIGE = 1;
/** Real levels between two gear tiers - the slots past the base ladder. */
export const GEAR_TIER_LEVELS = 1;
export const UPGRADE_XP_BONUS = 0.1;
/** XP-gain bonus per medal, by tier - compounded over every medal held. */
export const MEDAL_XP_BONUS = {
	bronze: 0.0025, silver: 0.005, gold: 0.01, platinum: 0.02, divine: 0.03,
} as const;

/** Real level the first prestige needs; each one taken raises it. */
export const PRESTIGE_MIN_LEVEL = 100;
export const PRESTIGE_LEVEL_STEP = 1;
/** Multiplicative xp bonus per prestige, in its own pool. */
export const PRESTIGE_XP_BONUS = 0.1;
/** Overall level the first rebirth needs; each generation raises it. */
export const REBIRTH_MIN_OVERALL_LEVEL = 110;
export const REBIRTH_LEVEL_STEP = 10;
/** Effective-boost growth per overdrive decade: log10(2) doubles it. */
export const OVERDRIVE_EXPONENT = Math.log10(2);
export const OVERDRIVE_SCALE = 2.5;
/** Overdrive's display prefix (the XP multiplier keeps a plain "x"). */
export const OVERDRIVE_SYMBOL = 'σ';

export type UpgradeState = {
	level: number,
	xp: number,
	upgrades: number,
	overdrive: number,
	prestige: number,
};

export type UpgradePurchase = UpgradeState & {
	spent: number,
	ratio: number,
};

/** Slots available on a skill: the base ladder plus one per prestige. */
export const maxUpgrades = (prestige: number): number =>
	BASE_MAX_UPGRADES + prestige * UPGRADES_PER_PRESTIGE;

/** The level required to afford the next upgrade. The base ladder steps by
 *  UPGRADE_LEVELS; gear tiers past it step by one, so each lands on the same
 *  level as the prestige that granted it. */
export const upgradeMinLevel = (upgrades: number): number =>
	upgrades < BASE_MAX_UPGRADES
		? (upgrades + 1) * UPGRADE_LEVELS
		: BASE_MAX_UPGRADES * UPGRADE_LEVELS
			+ (upgrades - BASE_MAX_UPGRADES + 1) * GEAR_TIER_LEVELS;

/** Levels the next purchase spends: the base ladder costs UPGRADE_LEVELS, a gear
 *  tier costs the one level it stepped up by. */
export const upgradeCost = (upgrades: number): number =>
	upgrades < BASE_MAX_UPGRADES ? UPGRADE_LEVELS : GEAR_TIER_LEVELS;

/** Cost of the next upgrade bought exactly at its required level. */
export const upgradeMinSpend = (upgrades: number): number => {
	const min = upgradeMinLevel(upgrades);
	return xpToLevel(min) - xpToLevel(min - upgradeCost(upgrades));
};

export const canUpgrade = (
	{ level, upgrades, prestige }: Pick<UpgradeState, 'level' | 'upgrades' | 'prestige'>,
): boolean =>
	upgrades < maxUpgrades(prestige) && level >= upgradeMinLevel(upgrades);

/** Buy the next upgrade: drop its cost in levels (partial keeps its fraction),
 *  add the overspend ratio to overdrive, raised by `overdriveBonus`. */
export const applyUpgrade = (state: UpgradeState, overdriveBonus = 0): UpgradePurchase => {
	if (!canUpgrade(state)) throw new Error('upgrade not purchasable');

	const level = state.level - upgradeCost(state.upgrades);
	const xp = state.xp / xpForLevel(state.level) * xpForLevel(level);
	const spent = xpToLevel(state.level) + state.xp - xpToLevel(level) - xp;
	const ratio = spent / upgradeMinSpend(state.upgrades);

	return {
		level,
		xp,
		upgrades: state.upgrades + 1,
		overdrive: state.overdrive + (ratio > 1 ? ratio * (1 + overdriveBonus) : 0),
		prestige: state.prestige,
		spent,
		ratio,
	};
};

/** Admin: undo the last upgrade - applyUpgrade run backwards. `anchor` is the
 *  level the skill sat at right after the purchase: the refund is what those
 *  levels cost there, added to where the skill stands now. Left out, it is the
 *  current level, which is exact while the skill has not gained xp since. */
export const revertUpgrade = (
	state: UpgradeState,
	anchor = state.level,
): UpgradeState & { refund: number } => {
	if (state.upgrades === 0) throw new Error('no upgrade to revert');

	const upgrades = state.upgrades - 1;
	const top = anchor + upgradeCost(upgrades);
	const fraction = state.xp / xpForLevel(state.level);
	const refund = xpToLevel(top) + fraction * xpForLevel(top)
		- xpToLevel(anchor) - fraction * xpForLevel(anchor);
	const ratio = refund / upgradeMinSpend(upgrades);

	let level = state.level;
	let xp = state.xp + refund;
	// the refund is summed in another order than this walk, so a level it
	// lands exactly on can come out a hair short
	while (xp + 1e-3 >= xpForLevel(level)) {
		xp = Math.max(0, xp - xpForLevel(level));
		level++;
	}

	return {
		level,
		xp,
		upgrades,
		overdrive: Math.max(0, state.overdrive - (ratio > 1 ? ratio : 0)),
		prestige: state.prestige,
		refund,
	};
};

/** The real level a skill needs to prestige again. Bonus levels never count. */
export const prestigeMinLevel = (prestige: number): number =>
	PRESTIGE_MIN_LEVEL + prestige * PRESTIGE_LEVEL_STEP;

export const canPrestige = (
	{ level, prestige }: Pick<UpgradeState, 'level' | 'prestige'>,
): boolean =>
	level >= prestigeMinLevel(prestige);

/** Prestige a skill: level, xp, upgrades and overdrive all go, and the skill
 *  keeps a bonus level, an extra gear tier and a bigger multiplier.
 *
 *  `spent` is everything the reset levels were worth. The caller takes it off
 *  the running totals, so the overall level falls with the skill - a character
 *  who has prestiged everything is not still carrying the level it all bought.
 *  Lifetime is the exception and never moves: it is what the tooltip hints at.
 *
 *  `force` resets a skill that is not ready yet: the same reset, without the
 *  prestige it would count. */
export const applyPrestige = (
	state: UpgradeState,
	force = false,
): UpgradeState & { spent: number } => {
	const ready = canPrestige(state);
	if (!ready && !force) throw new Error('prestige not available');

	return {
		level: 0,
		xp: 0,
		upgrades: 0,
		overdrive: 0,
		prestige: state.prestige + (ready ? 1 : 0),
		spent: xpToLevel(state.level) + state.xp,
	};
};

/** The overdrive a prestige turns into climaxx: what the skill holds, plus what
 *  the next upgrade would add if it can be bought now. */
export const prestigeOverdrive = (state: UpgradeState, overdriveBonus = 0): number =>
	canUpgrade(state) ? applyUpgrade(state, overdriveBonus).overdrive : state.overdrive;

export const rebirthMinLevel = (generation: number): number =>
	REBIRTH_MIN_OVERALL_LEVEL + (generation - 1) * REBIRTH_LEVEL_STEP;

export const canRebirth = (overallLevel: number, generation: number): boolean =>
	overallLevel >= rebirthMinLevel(generation);

/** Effective boost of raw overdrive: degressive power law, floored at x1. */
export const overdriveMultiplier = (overdrive: number): number =>
	Math.max(1, Math.min(
		overdrive,
		OVERDRIVE_SCALE * Math.pow(overdrive, OVERDRIVE_EXPONENT),
	));

/** XP-gain multiplier: additive upgrade bonus, amplified by overdrive. */
export const upgradeXPMultiplier = (upgrades: number, overdrive: number): number =>
	1 + UPGRADE_XP_BONUS * upgrades * overdriveMultiplier(overdrive);

/** Its own pool: multiplicative, and multiplied with the upgrade bonus. */
export const prestigeXPMultiplier = (prestige: number): number =>
	Math.pow(1 + PRESTIGE_XP_BONUS, prestige);

/** Everything a skill's xp gain is multiplied by. */
export const skillXPMultiplier = (
	upgrades: number,
	overdrive: number,
	prestige: number,
): number =>
	upgradeXPMultiplier(upgrades, overdrive) * prestigeXPMultiplier(prestige);

/** A skill of the character's picked ruleset. */
export const upgradeBody = z.object({ skill: z.string() });
export type UpgradeBody = z.infer<typeof upgradeBody>;

export const rollbackBody = upgradeBody.extend({ anchor: z.int().min(0).optional() });

export const prestigeBody = z.object({
	skill: z.string(),
	force: z.boolean().optional(),
});
export type PrestigeBody = z.infer<typeof prestigeBody>;

import { z } from 'zod';

import {
	Big,
	type BigLike,
	ONE,
	ZERO,
} from './big.js';
import {
	heldTotal,
	xpForLevel,
	xpGivesLevel,
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
	xp: Big,
	upgrades: number,
	overdrive: Big,
	prestige: number,
};

export type UpgradePurchase = UpgradeState & {
	spent: Big,
	ratio: Big,
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
export const upgradeMinSpend = (upgrades: number): Big => {
	const min = upgradeMinLevel(upgrades);
	return xpToLevel(min).sub(xpToLevel(min - upgradeCost(upgrades)));
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
	const xp = state.xp.div(xpForLevel(state.level)).mul(xpForLevel(level));
	const spent = heldTotal(state.level, state.xp).sub(heldTotal(level, xp));
	const ratio = spent.div(upgradeMinSpend(state.upgrades));

	return {
		level,
		xp,
		upgrades: state.upgrades + 1,
		overdrive: state.overdrive.add(ratio.gt(1) ? ratio.mul(1 + overdriveBonus) : ZERO),
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
): UpgradeState & { refund: Big } => {
	if (state.upgrades === 0) throw new Error('no upgrade to revert');

	const upgrades = state.upgrades - 1;
	const top = anchor + upgradeCost(upgrades);
	const fraction = state.xp.div(xpForLevel(state.level));
	const refund = heldTotal(top, fraction.mul(xpForLevel(top)))
		.sub(heldTotal(anchor, fraction.mul(xpForLevel(anchor))));
	const ratio = refund.div(upgradeMinSpend(upgrades));
	const { level, xp } = xpGivesLevel(heldTotal(state.level, state.xp).add(refund));

	return {
		level,
		xp,
		upgrades,
		overdrive: ZERO.max(state.overdrive.sub(ratio.gt(1) ? ratio : ZERO)),
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
 *  `spent` is everything the reset levels were worth. The running totals are set
 *  from what the skill now holds, so the overall level falls with the skill.
 *  Lifetime never moves.
 *
 *  `force` resets a skill that is not ready yet: the same reset, without the
 *  prestige it would count. */
export const applyPrestige = (
	state: UpgradeState,
	force = false,
): UpgradeState & { spent: Big } => {
	const ready = canPrestige(state);
	if (!ready && !force) throw new Error('prestige not available');

	return {
		level: 0,
		xp: ZERO,
		upgrades: 0,
		overdrive: ZERO,
		prestige: state.prestige + (ready ? 1 : 0),
		spent: heldTotal(state.level, state.xp),
	};
};

/** The overdrive a prestige turns into climaxx: what the skill holds, plus what
 *  the next upgrade would add if it can be bought now. */
export const prestigeOverdrive = (state: UpgradeState, overdriveBonus = 0): Big =>
	canUpgrade(state) ? applyUpgrade(state, overdriveBonus).overdrive : state.overdrive;

export const rebirthMinLevel = (generation: number): number =>
	REBIRTH_MIN_OVERALL_LEVEL + (generation - 1) * REBIRTH_LEVEL_STEP;

export const canRebirth = (overallLevel: number, generation: number): boolean =>
	overallLevel >= rebirthMinLevel(generation);

/** Effective boost of raw overdrive: degressive power law, floored at x1. */
export const overdriveMultiplier = (overdrive: BigLike): Big => {
	const od = Big.from(overdrive);
	return ONE.max(od.min(od.pow(OVERDRIVE_EXPONENT).mul(OVERDRIVE_SCALE)));
};

/** XP-gain multiplier: additive upgrade bonus, amplified by overdrive. */
export const upgradeXPMultiplier = (upgrades: number, overdrive: BigLike): Big =>
	overdriveMultiplier(overdrive).mul(UPGRADE_XP_BONUS * upgrades).add(1);

/** Its own pool: multiplicative, and multiplied with the upgrade bonus. */
export const prestigeXPMultiplier = (prestige: number): Big =>
	Big.from(1 + PRESTIGE_XP_BONUS).pow(prestige);

/** Everything a skill's xp gain is multiplied by. */
export const skillXPMultiplier = (
	upgrades: number,
	overdrive: BigLike,
	prestige: number,
): Big =>
	upgradeXPMultiplier(upgrades, overdrive).mul(prestigeXPMultiplier(prestige));

/** A skill of the character's picked ruleset. */
export const upgradeBody = z.object({ skill: z.string() });
export type UpgradeBody = z.infer<typeof upgradeBody>;

export const rollbackBody = upgradeBody.extend({ anchor: z.int().min(0).optional() });

export const prestigeBody = z.object({
	skill: z.string(),
	force: z.boolean().optional(),
});
export type PrestigeBody = z.infer<typeof prestigeBody>;

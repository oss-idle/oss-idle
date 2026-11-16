import type { ApiSkill } from '@oss-idle/shared/apiV2';
import {
	type Big,
	toText,
} from '@oss-idle/shared/big';
import {
	applyUpgrade,
	canUpgrade,
	prestigeXPMultiplier,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';
import { playLevelOf } from '@oss-idle/shared/xp';

/** What the character brings to a skill from outside it. */
export type SkillContext = {
	/** the genes' bonus on the overdrive an upgrade adds */
	overdriveBonus?: number,
	/** the medals' XP multiplier, the same on every skill */
	medals?: number,
	/** with genetics: the climaxx the skill has to spend, and the genetics' XP multiplier */
	climaxx?: Big,
	geneticsXp?: number,
};

/** A skill as API v2 gives it: the level it plays at, the XP level it holds now, what its next
 *  upgrade would add to its overdrive, and everything its XP gains are multiplied by. */
export const apiSkill = (skill: {
	level: number,
	xp: Big,
	lifetimeXp: Big,
	prestige: number,
	upgrades: number,
	overdrive: Big,
}, {
	overdriveBonus = 0, medals = 1, climaxx, geneticsXp,
}: SkillContext = {}): ApiSkill => {
	const shown = playLevelOf(skill.level, skill.xp, skill.lifetimeXp, skill.prestige);
	const upgrades = upgradeXPMultiplier(skill.upgrades, skill.overdrive);
	const prestige = prestigeXPMultiplier(skill.prestige);
	return {
		level: Math.floor(shown),
		progress: Math.min(99, Math.floor((shown % 1) * 100)),
		lifetime_level: Math.floor(shown) - skill.prestige,
		xp_level: skill.level,
		xp: toText(skill.xp),
		total_xp: toText(skill.lifetimeXp),
		prestige: skill.prestige,
		upgrades: skill.upgrades,
		overdrive: toText(skill.overdrive),
		upgrade_overdrive: canUpgrade(skill)
			? toText(applyUpgrade(skill, overdriveBonus).overdrive.sub(skill.overdrive))
			: undefined,
		climaxx: climaxx && toText(climaxx),
		xp_multipliers: {
			upgrades: toText(upgrades),
			prestige: toText(prestige),
			genetics: geneticsXp === undefined ? undefined : String(geneticsXp),
			medals: String(medals),
			total: toText(upgrades.mul(prestige).mul(geneticsXp ?? 1).mul(medals)),
		},
	};
};

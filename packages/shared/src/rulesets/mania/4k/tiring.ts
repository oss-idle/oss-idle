import { keptShare } from '../../../fatigue.js';
import {
	heldTotal,
	xpGivesLevel,
} from '../../../xp.js';
import { PHYSICAL_SKILLS } from './skills.js';
import { makeOrderedSkills } from './skills/factory.js';
import Memory from './skills/memory.js';
import type Skill from './skills/skill.js';

/** A physical skill at fatigue `fatigue` and warm-up `warm` plays at the level part of the xp behind its level reaches. */
export const tireSkill = (skill: Skill, fatigue: number, warm = 1) => {
	if (!PHYSICAL_SKILLS.includes(skill.name)) return;
	const kept = keptShare(skill.playLevel(), fatigue, warm);
	if (kept >= 1) return;
	const { level, xp } = xpGivesLevel(heldTotal(skill.level.get(), skill.xp.get()).mul(kept));
	skill.level.set(level);
	skill.xp.set(xp);
	skill.lifetimeXp.set(skill.lifetimeXp.get().mul(kept));
};

/** A tired copy of `skills`, leaving the originals as they are. */
export const tiredSkills = (skills: Skill[], fatigue: number, warm: number): Skill[] =>
	makeOrderedSkills().map(copy => {
		const skill = skills.find(s => s.name === copy.name)!;
		copy.apply(skill.state());
		if (copy instanceof Memory && skill instanceof Memory) {
			copy.timesPlayed.set(skill.timesPlayed.get());
		}
		tireSkill(copy, fatigue, warm);
		return copy;
	});

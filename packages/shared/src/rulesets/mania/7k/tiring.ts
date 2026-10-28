import { keptShare } from '../../../fatigue.js';
import {
	xpGivesLevel,
	xpToLevel,
} from '../../../xp.js';
import type SkillState from '../../skillState.js';
import { PHYSICAL_SKILLS_7K } from './skills.js';

/** A physical 7K skill at fatigue `fatigue` and warm-up `warm` plays at the level part of
 *  the xp behind its level reaches. */
export const tireSkill7k = (skill: SkillState, fatigue: number, warm = 1) => {
	if (!(PHYSICAL_SKILLS_7K as readonly string[]).includes(skill.name)) return;
	const kept = keptShare(skill.playLevel(), fatigue, warm);
	if (kept >= 1) return;
	const { level, xp } = xpGivesLevel((xpToLevel(skill.level.get()) + skill.xp.get()) * kept);
	void skill.level.set(level);
	void skill.xp.set(xp);
};

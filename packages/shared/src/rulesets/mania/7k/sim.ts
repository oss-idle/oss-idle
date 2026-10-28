import SkillState from '../../skillState.js';
import type { ManiaSim } from '../sim.js';
import Bot7k, { type ScoreLike7k } from './bots/character.js';
import {
	type SkillName7k,
	Skills7k,
} from './skills.js';
import { tireSkill7k } from './tiring.js';

/** 7K's public sim: the character's skills at their progress, tired. */
export const sim7k: ManiaSim<SkillName7k, ScoreLike7k> = {
	bot: ({
		progress, fatigue, warm, plays,
	}) => new Bot7k(Skills7k.map(name => {
		const skill = new SkillState(name);
		skill.apply(progress(name));
		tireSkill7k(skill, fatigue, warm);
		return skill;
	}), plays),
};

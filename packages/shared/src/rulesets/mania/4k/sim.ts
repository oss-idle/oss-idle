import type {
	ManiaSim,
	SimPlay,
} from '../sim.js';
import { analyze4k } from './analysis.js';
import CharacterBot, { type ScoreLike } from './bots/character.js';
import type { SkillName } from './skills.js';
import { makeOrderedSkills } from './skills/factory.js';
import Memory from './skills/memory.js';
import { tireSkill } from './tiring.js';

/** The character's skills at their progress, tired, memory at its plays. */
const skillsFor = ({
	progress, fatigue, warm, plays,
}: SimPlay<SkillName>) => {
	const skills = makeOrderedSkills();
	for (const skill of skills) {
		const p = progress(skill.name);
		skill.apply(p);
		skill.lifetimeXp.set(p.lifetimeXp);
		tireSkill(skill, fatigue, warm);
		if (skill instanceof Memory) skill.timesPlayed.set(plays);
	}
	return skills;
};

/** 4K's public sim. */
export const sim4k: ManiaSim<SkillName, ScoreLike> = {
	bot: play => new CharacterBot(skillsFor(play)),
	analyze: (play, beatmap, options) => analyze4k(skillsFor(play), beatmap, options),
};

import type { RulesetDef } from '../../ruleset.js';
import hitAccuracy from '../hitAccuracy.js';
import {
	JUDGEMENT,
	type Judgement,
	Judgements,
} from '../judgement.js';
import { performanceArgs } from '../performanceArgs.js';
import {
	prestigeNote,
	skillDescription,
	skillName,
	skillsNote,
	upgradeDescription,
	upgradeLabel,
} from './display.js';
import {
	MEDAL_LINES,
	MEDALS,
} from './medals.js';
import {
	medalDescription,
	medalName,
} from './medalText.js';
import { modXpMultipliers } from './modXp.js';
import {
	PHYSICAL_SKILLS,
	SKILL,
	type SkillName,
	Skills,
} from './skills.js';

export const mania4k = {
	id: 'mania4k',
	judgements: Judgements,
	miss: JUDGEMENT.MISS,
	skills: Skills,
	accuracyOf: hitAccuracy,
	skillName,
	skillDescription,
	upgradeDescription,
	upgradeLabel,
	modXpMultipliers,
	prestigeNote,
	skillsNote,
	physicalSkills: PHYSICAL_SKILLS,
	// accuracy, memory and consistency don't strain the way a gauge shows
	gauged: Skills.filter(s => s !== SKILL.accuracy && s !== SKILL.memory && s !== SKILL.consistency),
	rateSkill: SKILL.speed,
	warmupSkill: SKILL.stamina,
	rebirth: true,
	performanceArgs,
	medals: {
		medals: MEDALS, lines: MEDAL_LINES, prefix: '', name: medalName, description: medalDescription,
	},
} as const satisfies RulesetDef<Judgement, SkillName>;

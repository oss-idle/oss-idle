import type { RulesetDef } from '../../ruleset.js';
import hitAccuracy from '../hitAccuracy.js';
import {
	JUDGEMENT,
	type Judgement,
	Judgements,
} from '../judgement.js';
import { performanceArgs } from '../performanceArgs.js';
import {
	prestigeNote7k,
	skillDescription7k,
	skillName7k,
	skillsNote7k,
	upgradeDescription7k,
	upgradeLabel7k,
} from './display.js';
import {
	MEDAL_LINES_7K,
	MEDAL_PREFIX_7K,
	MEDALS_7K,
} from './medals.js';
import {
	medalDescription7k,
	medalName7k,
} from './medalText.js';
import { modXpMultipliers7k } from './modXp.js';
import {
	PHYSICAL_SKILLS_7K,
	SKILL_7K,
	type SkillName7k,
	Skills7k,
} from './skills.js';

/** Mania 7K: mania's engine, renderer and editor, everything else its own. Dev only. */
export const mania7k = {
	id: 'mania7k',
	judgements: Judgements,
	miss: JUDGEMENT.MISS,
	skills: Skills7k,
	accuracyOf: hitAccuracy,
	skillName: skillName7k,
	skillDescription: skillDescription7k,
	upgradeDescription: upgradeDescription7k,
	upgradeLabel: upgradeLabel7k,
	modXpMultipliers: modXpMultipliers7k,
	prestigeNote: prestigeNote7k,
	skillsNote: skillsNote7k,
	physicalSkills: PHYSICAL_SKILLS_7K,
	gauged: Skills7k.filter(s => s !== SKILL_7K.accuracy && s !== SKILL_7K.memory),
	rateSkill: SKILL_7K.speed,
	warmupSkill: SKILL_7K.stamina,
	performanceArgs,
	medals: {
		medals: MEDALS_7K,
		lines: MEDAL_LINES_7K,
		prefix: MEDAL_PREFIX_7K,
		name: medalName7k,
		description: medalDescription7k,
	},
} as const satisfies RulesetDef<Judgement, SkillName7k>;

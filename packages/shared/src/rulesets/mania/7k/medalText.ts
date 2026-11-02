import { __ } from '../../../i18n/translate.js';
import { medalText } from '../medalText.js';
import { skillName7k } from './display.js';
import { MEDAL_PREFIX_7K } from './medals.js';
import type { SkillName7k } from './skills.js';

/** The skill as it reads inside a medal name (see 4K's medalText); literal contexts
 *  for extraction. */
const MEDAL_SKILL: Record<SkillName7k, () => string> = {
	accuracy: () => __('Accuracy', 'skill in a medal name'),
	speed: () => __('Speed', 'skill in a medal name'),
	stamina: () => __('Stamina', 'skill in a medal name'),
	jacks: () => __('Jacks', 'skill in a medal name'),
	independence: () => __('Independence', 'skill in a medal name'),
	ln: () => __('LN', 'skill in a medal name'),
	technical: () => __('Technical', 'skill in a medal name'),
	focus: () => __('Focus', 'skill in a medal name'),
	sv: () => __('SV', 'skill in a medal name'),
	memory: () => __('Memory', 'skill in a medal name'),
};

/** 7K's medal names and descriptions. */
export const { name: medalName7k, description: medalDescription7k } = medalText(MEDAL_PREFIX_7K, {
	inName: skill => (MEDAL_SKILL as Partial<Record<string, () => string>>)[skill]?.(),
	name: skill => skillName7k(skill as SkillName7k),
});

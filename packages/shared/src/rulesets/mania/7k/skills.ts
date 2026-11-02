import {
	mapped,
	type ValueIn,
} from '../../../helpers/mapped.js';
import type { Mod } from '../../../mods.js';

export const Skills7k = [
	'accuracy',
	'speed',
	'stamina',
	'jacks',
	'independence',
	'ln',
	'technical',
	'focus',
	'sv',
	'memory',
] as const;
export const SKILL_7K = mapped(Skills7k);
export type SkillName7k = ValueIn<typeof SKILL_7K>;

/** Trained by repetition, so no mindblock: they tire instead. */
export const PHYSICAL_SKILLS_7K: SkillName7k[] = [
	SKILL_7K.speed,
	SKILL_7K.stamina,
	SKILL_7K.jacks,
	SKILL_7K.ln,
];

export const MINDBLOCK_SKILLS_7K: SkillName7k[] = Skills7k
	.filter(s => !PHYSICAL_SKILLS_7K.includes(s) && s !== SKILL_7K.memory);

export type Thumb = 'left' | 'right';

/** Which hand's thumb plays the middle key: the left's unless the play has the RT mod. */
export const thumbOf = (mods: readonly Mod[]): Thumb => mods.includes('RT') ? 'right' : 'left';

/** Columns 0-2 are the left hand's, 4-6 the right's; the middle key goes with the thumb. */
export const handOf = (column: number, thumb: Thumb = 'left'): 'left' | 'right' =>
	column < 3 || (column === 3 && thumb === 'left') ? 'left' : 'right';

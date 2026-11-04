import { t } from '@lingui/core/macro';

import {
	SKILL_7K,
	type SkillName7k,
} from '@oss-idle/shared/rulesets/mania/7k/skills';

import type { QuizQuestion } from '../../ruleset';
import { QUIZ } from '../4k/quiz';

/** The 7K skill each 4K skill's answers point at. */
const AS_7K: Record<string, SkillName7k> = {
	accuracy: SKILL_7K.accuracy,
	release: SKILL_7K.ln,
	coordination: SKILL_7K.independence,
	speed: SKILL_7K.speed,
	stamina: SKILL_7K.stamina,
	jackspeed: SKILL_7K.jacks,
	reading: SKILL_7K.technical,
	speedjam: SKILL_7K.sv,
	memory: SKILL_7K.memory,
	consistency: SKILL_7K.focus,
	concentration: SKILL_7K.focus,
};

/** 4K's everyday questions, their answers pointing at 7K's skills. */
export const QUIZ_7K: QuizQuestion[] = QUIZ.map(q => ({
	...q, answers: q.answers.map(a => ({
		...a, skill: AS_7K[a.skill],
	})),
}));

/** Each genetic in a few plain words. */
export const SKILL_PITCH_7K: Record<SkillName7k, () => string> = {
	accuracy: () => t`Hits every note right on time.`,
	ln: () => t`Lets go of long notes at just the right moment.`,
	independence: () => t`Holds long notes down while the other fingers keep playing.`,
	speed: () => t`Fast fingers for quick, busy songs.`,
	stamina: () => t`Keeps going through long, intense songs.`,
	jacks: () => t`Hammers the same key again and again, fast.`,
	technical: () => t`Untangles tricky, unusual patterns.`,
	sv: () => t`Keeps up when the notes speed up and slow down.`,
	memory: () => t`Gets better every time it replays a song.`,
	focus: () => t`Stays calm and focused all the way through long songs.`,
};

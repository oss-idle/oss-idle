import { t } from '@lingui/core/macro';

import { SKILL } from '@oss-idle/shared/rulesets/mania/4k/skills';

import type { QuizQuestion } from '../../ruleset';


/** Everyday questions, no rhythm game needed: each answer points at a skill. */
export const QUIZ: QuizQuestion[] = [
	{
		ask: () => t`A free afternoon. What sounds best?`,
		answers: [
			{
				skill: SKILL.stamina, text: () => t`A long hike`, because: () => t`you like going the distance`, 
			},
			{
				skill: SKILL.reading,
				text: () => t`A tricky puzzle`,
				because: () => t`you like figuring things out`,
			},
			{
				skill: SKILL.speed,
				text: () => t`A quick arcade game, beating your best`,
				because: () => t`you like things fast`,
			},
			{
				skill: SKILL.memory,
				text: () => t`Learning a song by heart`,
				because: () => t`you like knowing something inside out`,
			},
		],
	},
	{
		ask: () => t`In the kitchen, you're the one who…`,
		answers: [
			{
				skill: SKILL.accuracy,
				text: () => t`follows the recipe to the gram`,
				because: () => t`you like getting every detail exactly right`,
			},
			{
				skill: SKILL.coordination,
				text: () => t`keeps three pans going at once`,
				because: () => t`you like doing two things at once`,
			},
			{
				skill: SKILL.speedjam,
				text: () => t`improvises when something goes wrong`,
				because: () => t`you adapt when things change`,
			},
			{
				skill: SKILL.consistency,
				text: () => t`makes the same dish until it's perfect every time`,
				because: () => t`you like doing it right every time`,
			},
		],
	},
	{
		ask: () => t`Under pressure, you…`,
		answers: [
			{
				skill: SKILL.consistency,
				text: () => t`stay calm and steady`,
				because: () => t`you keep your cool`,
			},
			{
				skill: SKILL.concentration,
				text: () => t`shut everything else out`,
				because: () => t`you stay focused`,
			},
			{
				skill: SKILL.speed, text: () => t`speed up`, because: () => t`pressure makes you faster`, 
			},
			{
				skill: SKILL.speedjam,
				text: () => t`adapt when plans change`,
				because: () => t`you roll with surprises`,
			},
		],
	},
	{
		ask: () => t`Tapping along to music, you'd rather…`,
		answers: [
			{
				skill: SKILL.jackspeed,
				text: () => t`tap one finger as fast as you can`,
				because: () => t`you have quick fingers`,
			},
			{
				skill: SKILL.release,
				text: () => t`hold a note and let go right on time`,
				because: () => t`you have a sense of timing`,
			},
			{
				skill: SKILL.coordination,
				text: () => t`have both hands do different things`,
				because: () => t`your hands work on their own`,
			},
			{
				skill: SKILL.accuracy,
				text: () => t`land right on the beat, every time`,
				because: () => t`you like being precise`,
			},
		],
	},
	{
		ask: () => t`A long film or book…`,
		answers: [
			{
				skill: SKILL.concentration,
				text: () => t`hooks you until the end`,
				because: () => t`you can stay with something for a long time`,
			},
			{
				skill: SKILL.stamina,
				text: () => t`you could go for hours more`,
				because: () => t`you don't run out of steam`,
			},
			{
				skill: SKILL.accuracy,
				text: () => t`you notice every little detail`,
				because: () => t`you notice the details`,
			},
			{
				skill: SKILL.memory,
				text: () => t`you'd rather watch it twice and know it by heart`,
				because: () => t`you like learning things by heart`,
			},
		],
	},
	{
		ask: () => t`A new board game. You…`,
		answers: [
			{
				skill: SKILL.reading,
				text: () => t`read every rule and spot the patterns`,
				because: () => t`you spot patterns`,
			},
			{
				skill: SKILL.jackspeed,
				text: () => t`repeat your best move, faster every time`,
				because: () => t`you like doing one thing really fast`,
			},
			{
				skill: SKILL.release,
				text: () => t`know exactly when to let go of a lead`,
				because: () => t`you know when to let go`,
			},
			{
				skill: SKILL.speedjam,
				text: () => t`go with the flow when it surprises you`,
				because: () => t`surprises don't throw you`,
			},
		],
	},
];

/** Each genetic in a few plain words. */
export const SKILL_PITCH: Record<string, () => string> = {
	accuracy: () => t`Hits every note right on time.`,
	release: () => t`Lets go of long notes at just the right moment.`,
	coordination: () => t`Keeps both hands busy without getting tangled.`,
	speed: () => t`Fast fingers for quick, busy songs.`,
	stamina: () => t`Keeps going through long, intense songs.`,
	consistency: () => t`Stays calm and rarely slips up.`,
	jackspeed: () => t`Hammers the same key again and again, fast.`,
	reading: () => t`Untangles tricky, unusual patterns.`,
	speedjam: () => t`Keeps up when the notes speed up and slow down.`,
	memory: () => t`Gets better every time it replays a song.`,
	concentration: () => t`Stays focused all the way through long songs.`,
};


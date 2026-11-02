import {
	type GeneticsDef,
	quizResult,
} from '@oss-idle/shared/genetics';

import type { QuizQuestion } from '../../rulesets/ruleset';

/** What the answers add up to: the skill, a close runner-up, and why, in the answers' own words. */
export const quizOutcome = (
	def: GeneticsDef,
	quiz: readonly QuizQuestion[],
	answers: readonly string[],
) => {
	if (answers.length < quiz.length) return undefined;
	const { skill, close } = quizResult(def, answers);
	const why = answers
		.map((picked, i) => picked === skill && quiz[i].answers.find(a => a.skill === picked)?.because())
		.filter(Boolean)
		.slice(0, 2)
		.join(', ');
	return {
		skill, close, why: why && `${why[0].toUpperCase()}${why.slice(1)}.`,
	};
};
export type QuizOutcome = NonNullable<ReturnType<typeof quizOutcome>>;

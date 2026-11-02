import { Trans } from '@lingui/react/macro';

import { uiSound } from '../../audio/uiSounds';
import type { QuizQuestion } from '../../rulesets/ruleset';
import GeneticQuiz from './GeneticQuiz';

type Props = {
	quiz: readonly QuizQuestion[],
	step: number,
	onAnswer: (skill: string) => void,
	onSkip: () => void,
};

/** The quiz, one question at a time, the wheel always a click away. */
export default function GeneticQuizScreen({
	quiz, step, onAnswer, onSkip,
}: Props) {
	return (
		<>
			<GeneticQuiz quiz={quiz} step={step} onAnswer={onAnswer} />
			<button
				className="genetic-choice__skip"
				onMouseEnter={() => uiSound('ui/default-hover')}
				onClick={() => {
					uiSound('ui/screen-back');
					onSkip();
				}}
			>
				<Trans>Skip, show me the wheel</Trans> ›
			</button>
		</>
	);
}

import { Trans } from '@lingui/react/macro';

import { uiSound } from '../../audio/uiSounds';
import { selectedGenetics } from '../../rulesets/registry';
import type { QuizQuestion } from '../../rulesets/ruleset';
import Glyph from '../multiplayer/Glyph';

type Props = { quiz: readonly QuizQuestion[], step: number, onAnswer: (skill: string) => void };

/** One question at a time, four everyday answers. */
export default function GeneticQuiz({ quiz, step, onAnswer }: Props) {
	const question = quiz[step];
	const number = step + 1, total = quiz.length;
	const glyphs = selectedGenetics()?.glyph ?? {};
	return (
		<div key={step} className="genetic-quiz">
			<div className="genetic-quiz__progress">
				{quiz.map((_, i) => <i key={i} className={i <= step ? 'is-on' : ''} />)}
			</div>
			<div className="genetic-quiz__question">{question.ask()}</div>
			<div className="genetic-quiz__answers">
				{question.answers.map((answer, i) => (
					<button
						key={answer.skill + i}
						className="genetic-quiz__answer"
						style={{ '--i': i } as React.CSSProperties}
						onMouseEnter={() => uiSound('ui/default-hover')}
						onClick={() => {
							uiSound('ui/default-select');
							onAnswer(answer.skill);
						}}
					>
						{glyphs[answer.skill] && <Glyph name={glyphs[answer.skill]} className="genetic-quiz__icon" />}
						<span>{answer.text()}</span>
						<small>{i + 1}</small>
					</button>
				))}
			</div>
			<div className="genetic-quiz__count">
				<Trans>Question {number} of {total}</Trans>
			</div>
		</div>
	);
}

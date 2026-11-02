import { Trans } from '@lingui/react/macro';

import { selectedDef } from '../../rulesets/registry';
import type { QuizOutcome } from './quizOutcome';

/** The question, the quiz's answer to it, or changing a genetic already picked. */
type Props = { result?: QuizOutcome, changing: boolean, another: boolean };

export default function GeneticChoiceTitle({ result, changing, another }: Props) {
	const name = (skill: string) => selectedDef().skillName(skill);
	if (result?.close) {
		const a = name(result.skill), b = name(result.close);
		return <Trans>You're between {a} and {b}</Trans>;
	}
	if (result) {
		const skill = name(result.skill);
		return <Trans>You'd make a great {skill} player</Trans>;
	}
	if (changing) return <Trans>Change what you were born good at</Trans>;
	if (another) return <Trans>What else were you born good at?</Trans>;
	return <Trans>What were you born good at?</Trans>;
}

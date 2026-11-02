import { Trans } from '@lingui/react/macro';
import {
	type ReactNode,
	useState,
} from 'react';

import type { GeneticsDef } from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import { selectedDef } from '../../rulesets/registry';
import GeneticHub from './GeneticHub';
import GeneticRing from './GeneticRing';
import type useChoiceSlot from './useChoiceSlot';

type Props = {
	def: GeneticsDef,
	title: ReactNode,
	picked?: string,
	choice: ReturnType<typeof useChoiceSlot>,
	/** what the quiz suggests */
	suggested?: readonly string[],
	why?: string,
	/** the line under the button */
	under: ReactNode,
	busy: boolean,
	onPick: (skill: string) => void,
	onQuiz: () => void,
	onTrees: () => void,
	onBegin: (skill: string) => void,
};

/** The ring with its buttons under it: the quiz until a skill is picked, then beginning with it,
 *  and a look at the skill trees. */
export default function GeneticPickScreen({
	def, title, picked, choice, suggested, why, under, busy, onPick, onQuiz, onTrees, onBegin,
}: Props) {
	const [hovered, setHovered] = useState<string>();
	const shown = hovered ?? picked;
	const shownWhy = shown && suggested?.includes(shown) ? why : undefined;
	const skillName = (skill?: string) => skill && selectedDef().skillName(skill);
	const name = skillName(picked), old = skillName(choice.leaving);
	return (
		<>
			<h1 className="genetic-choice__title">{title}</h1>
			<GeneticRing
				def={def}
				picked={picked}
				others={choice.others}
				leaving={choice.leaving}
				hovered={hovered}
				suggested={suggested}
				onHover={setHovered}
				onPick={onPick}
				hub={<GeneticHub def={def} skill={shown} picked={picked} choice={choice} why={shownWhy} />}
			/>
			<div className="genetic-choice__foot">
				<div className="genetic-choice__actions">
					{!choice.needsSlot && (
						<button
							className={`genetic-choice__cta${busy ? ' is-busy' : ''}`}
							disabled={busy}
							onMouseEnter={() => uiSound('ui/default-hover')}
							onClick={() => (picked ? onBegin(picked) : (uiSound('ui/default-select'), onQuiz()))}
						>
							<span>
								{!picked && <Trans>Not sure? Take the quiz</Trans>}
								{picked && !old && <Trans>Begin with {name}</Trans>}
								{picked && old && <Trans>Replace {old} with {name}</Trans>}
							</span>
						</button>
					)}
					<button
						className="genetic-choice__cta genetic-choice__cta--plain"
						disabled={busy}
						onClick={onTrees}
					>
						<span><Trans>See the skill trees</Trans></span>
					</button>
				</div>
				<div className="genetic-choice__under">{under}</div>
			</div>
		</>
	);
}

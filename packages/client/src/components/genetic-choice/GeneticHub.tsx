import { Trans } from '@lingui/react/macro';

import type { GeneticsDef } from '@oss-idle/shared/genetics';

import {
	selectedDef,
	selectedGenetics,
} from '../../rulesets/registry';
import GeneticHubReach from './GeneticHubReach';
import GeneticHubTag from './GeneticHubTag';
import type useChoiceSlot from './useChoiceSlot';

type Props = {
	def: GeneticsDef,
	/** the hovered skill, else the picked one */
	skill?: string,
	picked?: string,
	choice: ReturnType<typeof useChoiceSlot>,
	/** the quiz's reason, shown on the skill it suggests */
	why?: string,
};

/** The ring's middle: the skill under the cursor in plain words, and what picking it gives. */
export default function GeneticHub({
	def, skill, picked, choice, why,
}: Props) {
	if (!skill) {
		return (
			<div className="genetic-hub__hint">
				{choice.needsSlot
					? <Trans>Click one of your genetics to replace it</Trans>
					: <Trans>Hover a skill to see what it does</Trans>}
			</div>
		);
	}
	const { others, leaving } = choice;
	const n = def.ring.length, i = def.ring.indexOf(skill);
	const name = (s: string) => selectedDef().skillName(s);
	const left = name(def.ring[(i + n - 1) % n]), right = name(def.ring[(i + 1) % n]);
	const after = others.includes(skill) || skill === leaving ? others : [...others, skill];
	return (
		<div key={skill} className="genetic-hub">
			<GeneticHubTag skill={skill} picked={picked} choice={choice} />
			<div className="genetic-hub__name">{name(skill)}</div>
			<div className="genetic-hub__pitch">{selectedGenetics()?.pitch[skill]?.()}</div>
			{others.length === 0
				? (
					<div className="genetic-hub__pairs">
						<Trans>Its genes at full strength, {left} and {right}'s at half</Trans>
					</div>
				)
				: <GeneticHubReach def={def} skill={skill} after={after} />}
			{why && <div className="genetic-hub__why">{why}</div>}
		</div>
	);
}

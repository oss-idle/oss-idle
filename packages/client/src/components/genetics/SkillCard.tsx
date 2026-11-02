import { Trans } from '@lingui/react/macro';

import {
	GENE_XP_BONUS,
	type Genetics,
	type GeneticsDef,
	pickedSkills,
} from '@oss-idle/shared/genetics';

import {
	selectedDef,
	selectedGenetics,
} from '../../rulesets/registry';
import StrengthBreakdown from '../genetic-choice/StrengthBreakdown';
import type { GeneActions } from './GeneticsCards';
import SkillCardBalance from './SkillCardBalance';

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	skill: string,
	actions?: GeneActions,
};

/** A skill's own star, opened: how strong its tree is for you, and what it holds. */
export default function SkillCard({
	def, genetics, skill, actions,
}: Props) {
	const picked = pickedSkills(genetics);
	const perTier = Math.round(GENE_XP_BONUS * 100);
	const name = selectedDef().skillName(skill);
	return (
		<div className="gene-card skill-card" onClick={e => e.stopPropagation()}>
			<h3 className="gene-card__name">{name}</h3>
			<StrengthBreakdown def={def} picked={picked} skill={skill} className="gene-card__next" />
			<p className="gene-card__does">{selectedGenetics()?.pitch[skill]?.()}</p>
			<div className="gene-card__next"><Trans>Each tier you buy adds {perTier}% {name} XP</Trans></div>
			{actions && <SkillCardBalance def={def} genetics={genetics} skill={skill} actions={actions} />}
		</div>
	);
}

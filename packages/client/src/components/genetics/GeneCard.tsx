import { Trans } from '@lingui/react/macro';

import {
	geneOf,
	type Genetics,
	type GeneticsDef,
	learnRefusal,
	nextTierPrice,
	pickedSkills,
	sellRefusal,
	strength,
	tierOf,
} from '@oss-idle/shared/genetics';

import { worksLocally } from '../../online/services/genetics';
import { selectedDef } from '../../rulesets/registry';
import GeneCardActions from './GeneCardActions';
import GeneCardEffect from './GeneCardEffect';
import { geneName } from './geneText';
import type { GeneActions } from './GeneticsCards';

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	gene: string,
	actions?: GeneActions,
};

/** What a gene does now and next, and buying or selling it. */
export default function GeneCard({
	def, genetics, gene, actions,
}: Props) {
	const info = geneOf(def, gene);
	if (!info) return null;
	const tier = tierOf(genetics, gene);
	const max = info.max;
	const skill = selectedDef().skillName(info.skill);
	const parent = info.parent && geneName(info.parent);

	return (
		<div className="gene-card" onClick={e => e.stopPropagation()}>
			<div className="gene-card__kicker">
				{max > 1 ? <Trans>{skill} gene · tier {tier} of {max}</Trans> : <Trans>{skill} gene</Trans>}
			</div>
			<h3 className="gene-card__name">{geneName(gene)}</h3>
			<GeneCardEffect
				gene={gene}
				tier={tier}
				max={max}
				power={strength(def, pickedSkills(genetics), info.skill)}
			/>
			{max > 1 && (
				<div className="gene-card__pips">
					{Array.from({ length: max }, (_, i) => <i key={i} className={i < tier ? 'is-on' : ''} />)}
				</div>
			)}
			{parent && <div className="gene-card__chip"><Trans>after {parent}</Trans></div>}
			{actions && (
				<GeneCardActions
					tier={tier}
					maxed={tier >= max}
					price={nextTierPrice(def, genetics, info.skill).toLocaleString()}
					learnable={learnRefusal(def, genetics, gene, actions.levels)}
					sellable={sellRefusal(def, genetics, gene, actions.levels)}
					parent={parent}
					busy={actions.busy}
					onlineOnly={actions.local && !worksLocally(info)}
					onLearn={() => actions.onLearn(gene)}
					onSell={() => actions.onSell(gene)}
				/>
			)}
		</div>
	);
}

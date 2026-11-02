import { Trans } from '@lingui/react/macro';

import { geneDoes } from './geneText';

type Props = { gene: string, tier: number, max: number, power: number };

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** What the gene does at its tier and the tree's strength, and at the next tier. A tree out of
 *  reach reads at full strength. */
export default function GeneCardEffect({
	gene, tier, max, power,
}: Props) {
	const strength = power || 1;
	return (
		<>
			<p className="gene-card__does">{sentence(geneDoes(gene, Math.max(1, tier) * strength))}</p>
			{tier > 0 && tier < max && (
				<div className="gene-card__next">
					<Trans>Next tier:</Trans> <b>{geneDoes(gene, (tier + 1) * strength)}</b>
				</div>
			)}
		</>
	);
}

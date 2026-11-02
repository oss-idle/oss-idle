import { Trans } from '@lingui/react/macro';

import {
	GENE_REFUSAL,
	type GeneRefusal,
} from '@oss-idle/shared/genetics';

/** Why a gene can't be bought or sold right now. */
type Props = { refusal?: GeneRefusal, parent?: string };

export default function GeneRefusalText({ refusal, parent }: Props) {
	switch (refusal) {
		case GENE_REFUSAL.tooPoor: return <Trans>Not enough climaxx</Trans>;
		case GENE_REFUSAL.needsParent: return <Trans>Needs {parent} first</Trans>;
		case GENE_REFUSAL.outOfReach: return <Trans>Out of reach</Trans>;
		case GENE_REFUSAL.heldChildren: return <Trans>Sell the genes after it first</Trans>;
		default: return null;
	}
}

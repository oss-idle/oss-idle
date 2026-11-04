import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import {
	CLIMAXX_SYMBOL,
	type GeneRefusal,
	SELL_FEE,
} from '@oss-idle/shared/genetics';

import GeneRefusalText from './GeneRefusalText';

type Props = {
	tier: number,
	maxed: boolean,
	price: ReactNode,
	learnable?: GeneRefusal,
	sellable?: GeneRefusal,
	parent?: string,
	busy: boolean,
	/** a local character, on a gene that works online alone */
	onlineOnly: boolean,
	onLearn: () => void,
	onSell: () => void,
};

/** Learning the next tier and selling the gene, and why either can't happen. */
export default function GeneCardActions({
	tier, maxed, price, learnable, sellable, parent, busy, onlineOnly, onLearn, onSell,
}: Props) {
	const why = maxed ? sellable : learnable ?? (tier > 0 ? sellable : undefined);
	if (onlineOnly) {
		return (
			<div className="gene-card__why">
				<Trans>Only works for online characters</Trans>
			</div>
		);
	}
	return (
		<>
			<div className="gene-card__acts">
				{!maxed && (
					<button className="gene-card__learn" disabled={busy || !!learnable} onClick={onLearn}>
						<span>
							{tier ? <Trans>Upgrade</Trans> : <Trans>Learn</Trans>}
							<small>{CLIMAXX_SYMBOL}{price}</small>
						</span>
					</button>
				)}
				{tier > 0 && (
					<button className="gene-card__sell" disabled={busy || !!sellable} onClick={onSell}>
						<span>
							<Trans>Sell</Trans>
							<small><Trans>{CLIMAXX_SYMBOL}{SELL_FEE} fee</Trans></small>
						</span>
					</button>
				)}
			</div>
			{why && (
				<div className="gene-card__why">
					<GeneRefusalText refusal={why} parent={parent} />
				</div>
			)}
		</>
	);
}

import { Trans } from '@lingui/react/macro';
import { Fragment } from 'react';

import {
	type GeneticsDef,
	strengthSources,
} from '@oss-idle/shared/genetics';

import { selectedDef } from '../../rulesets/registry';

type Props = {
	def: GeneticsDef,
	picked: readonly string[],
	skill: string,
	className: string,
};

/** Where a tree's strength comes from, when more than one genetic adds to it. */
export default function StrengthBreakdown({
	def, picked, skill, className,
}: Props) {
	const sources = strengthSources(def, picked, skill);
	if (sources.length < 2) return null;
	return (
		<div className={className}>
			{sources.map(({ from, amount }, i) => {
				const percent = Math.round(amount * 100), name = selectedDef().skillName(from);
				return (
					<Fragment key={from}>
						{i > 0 && ' + '}
						{from === skill ? <Trans>{percent}% as your genetic</Trans> : <Trans>{percent}% from {name}</Trans>}
					</Fragment>
				);
			})}
		</div>
	);
}

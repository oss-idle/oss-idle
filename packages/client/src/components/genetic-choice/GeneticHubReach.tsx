import { Trans } from '@lingui/react/macro';

import {
	type GeneticsDef,
	strength,
} from '@oss-idle/shared/genetics';

import StrengthBreakdown from './StrengthBreakdown';

type Props = {
	def: GeneticsDef,
	skill: string,
	/** the genetics as they would be */
	after: readonly string[],
};

/** How strong a tree would be with other genetics around, and from which. */
export default function GeneticHubReach({ def, skill, after }: Props) {
	const percent = Math.round(strength(def, after, skill) * 100);
	return (
		<>
			<div className="genetic-hub__pairs">
				{percent > 0
					? <Trans>Its genes at {percent}% strength</Trans>
					: <Trans>Its genes would be out of reach</Trans>}
			</div>
			<StrengthBreakdown def={def} picked={after} skill={skill} className="genetic-hub__pairs" />
		</>
	);
}

import { Trans } from '@lingui/react/macro';

import { changeableAt } from '@oss-idle/shared/genetics';

import { PBE } from '../../pbe/pbe';
import type useChoiceSlot from './useChoiceSlot';

type Props = {
	skill: string,
	picked?: string,
	choice: ReturnType<typeof useChoiceSlot>,
};

/** What the skill under the cursor is to this character. */
export default function GeneticHubTag({
	skill, picked, choice: { others, leaving, picks },
}: Props) {
	const held = picks.find(p => p.skill === skill);
	const hours = held && !PBE ? Math.ceil((changeableAt(held) - Date.now()) / 3600_000) : 0;
	if (skill === leaving) {
		return <div className="genetic-hub__picked"><Trans>Being replaced</Trans></div>;
	}
	if (skill === picked) {
		return <div className="genetic-hub__picked"><Trans>★ Your pick</Trans></div>;
	}
	if (!others.includes(skill)) return null;
	return (
		<div className="genetic-hub__picked">
			{hours > 0 ? <Trans>★ Your genetic · change in {hours}h</Trans> : <Trans>★ Your genetic</Trans>}
		</div>
	);
}

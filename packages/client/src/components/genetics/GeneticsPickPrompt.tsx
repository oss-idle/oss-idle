import { Trans } from '@lingui/react/macro';

import { geneticChoice } from '../../globals';

/** A character that has no genetic yet: one button to pick it. */
export default function GeneticsPickPrompt() {
	return (
		<div className="genetics genetics--empty">
			<p className="genetics__empty-text">
				<Trans>Your character hasn't picked what it was born good at yet.</Trans>
			</p>
			<button className="genetics__cta" onClick={() => void geneticChoice.set('change')}>
				<span><Trans>Pick a genetic</Trans></span>
			</button>
		</div>
	);
}

import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import HoverCard from '@oss-idle/shared/display/HoverCard';
import { CLIMAXX_SYMBOL } from '@oss-idle/shared/genetics';

/** The climaxx a prestige would earn, then its button. */
export default function PrestigeAction({
	ready,
	busy,
	required,
	gain,
	card,
	onConfirm,
}: {
	ready: boolean,
	busy: boolean,
	required: number,
	/** climaxx earned by prestiging now */
	gain: number,
	card: ReactNode,
	onConfirm: () => void,
}) {
	const climaxx = gain.toLocaleString();
	const shown = ready && gain > 0;
	return (
		<div className="ladder-act">
			<span className="ladder-act__od">
				{shown && <Trans>Climaxx +{CLIMAXX_SYMBOL}{climaxx}</Trans>}
			</span>
			<HoverCard className="ladder-act__main prestige-act" card={card}>
				{ready
					? <button className="ladder-act__buy" disabled={busy} onClick={onConfirm}>
						<span><Trans>Prestige</Trans></span>
					</button>
					: <span className="ladder-act__state"><span><Trans>Requires XP Lv{required}</Trans></span></span>}
			</HoverCard>
		</div>
	);
}

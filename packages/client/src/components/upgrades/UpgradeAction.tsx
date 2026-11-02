import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import HoverCard from '@oss-idle/shared/display/HoverCard';
import { overdriveText } from '@oss-idle/shared/display/overdrive';
import useShiftHeld from '@oss-idle/shared/hooks/useShiftHeld';
import type { UpgradePurchase } from '@oss-idle/shared/upgrades';

import OverdriveGainTip from './OverdriveGainTip';

/** Overdrive gain, then the buy button over its progress bar. Every slot keeps
 *  its size whatever it holds, so rows stay aligned.
 *  Shift buys without the confirm, and the button says so while it is held. */
export default function UpgradeAction({
	progress,
	maxed,
	overdrive,
	preview,
	busy,
	minLevel,
	onBuy,
	onConfirm,
	tip,
}: {
	/** 0..1 from the last upgrade's required level to the next one's */
	progress: number,
	maxed: boolean,
	overdrive: number,
	preview: UpgradePurchase | undefined,
	busy: boolean,
	minLevel: number,
	onBuy: () => void,
	onConfirm: () => void,
	/** hover card over the button; none when maxed */
	tip: ReactNode,
}) {
	const instant = useShiftHeld();
	const gain = preview ? preview.overdrive - overdrive : 0;
	const gainText = overdriveText(gain);
	const required = minLevel;

	const button = () => {
		if (maxed) {
			return <span className="ladder-act__state is-maxed"><span><Trans>Maxed</Trans></span></span>;
		}
		if (!preview) {
			return (
				<span className="ladder-act__state">
					<span><Trans>Requires XP Lv{required}</Trans></span>
				</span>
			);
		}
		return (
			<button
				className={`ladder-act__buy ${instant ? 'is-instant' : ''}`}
				disabled={busy}
				onClick={(e) => (e.shiftKey ? onBuy() : onConfirm())}
			>
				<span>
					{instant ? <Trans>Buy now</Trans> : <Trans>Buy</Trans>}
				</span>
			</button>
		);
	};

	return (
		<div className="ladder-act">
			<HoverCard
				className="ladder-act__od"
				card={preview && gain > 0 ? <OverdriveGainTip ratio={preview.ratio} gain={gain} /> : undefined}
			>
				{gain > 0 && <Trans>Overdrive +{gainText}</Trans>}
			</HoverCard>
			<div className="ladder-act__main">
				<HoverCard className="ladder-act__hover" card={maxed ? undefined : tip}>
					{button()}
				</HoverCard>
				<span className={`ladder-act__progress ${maxed ? 'is-hidden' : ''}`}>
					<span style={{ transform: `scaleX(${progress})` }} />
				</span>
			</div>
		</div>
	);
}

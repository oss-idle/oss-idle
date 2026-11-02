import { Trans } from '@lingui/react/macro';

import {
	CLIMAXX_SYMBOL,
	conversionGain,
} from '@oss-idle/shared/genetics';
import { OVERDRIVE_SYMBOL } from '@oss-idle/shared/upgrades';

type Props = {
	skill: string,
	climaxx: number,
	overdrive: number,
	/** overdrive the skill already turned into climaxx */
	converted: number,
	busy: boolean,
	onConvert: () => void,
};

/** The shown skill's climaxx, and turning its overdrive into more. */
export default function ClimaxxBalance({
	skill, climaxx, overdrive, converted, busy, onConvert,
}: Props) {
	const gain = conversionGain(converted, overdrive);
	const amount = overdrive.toFixed(1);
	return (
		<div className="climaxx">
			<div className="climaxx__amount">
				<b>{CLIMAXX_SYMBOL}{climaxx.toLocaleString()}</b> <Trans>{skill} climaxx</Trans>
			</div>
			{overdrive > 0 && gain > 0 && (
				<button className="climaxx__convert" disabled={busy} onClick={onConvert}>
					<span>
						<Trans>
							Turn {OVERDRIVE_SYMBOL}{amount} overdrive into {CLIMAXX_SYMBOL}{gain}
						</Trans>
					</span>
				</button>
			)}
		</div>
	);
}

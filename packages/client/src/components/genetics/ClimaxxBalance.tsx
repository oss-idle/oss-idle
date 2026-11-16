import { Trans } from '@lingui/react/macro';

import type { Big } from '@oss-idle/shared/big';
import BigNum from '@oss-idle/shared/display/BigNum';
import {
	CLIMAXX_SYMBOL,
	conversionGain,
} from '@oss-idle/shared/genetics';

import ConvertText from './ConvertText';

type Props = {
	skill: string,
	climaxx: Big,
	overdrive: Big,
	/** overdrive the next tier needs; none when there is nothing to convert */
	need?: Big,
	/** overdrive the skill already turned into climaxx */
	converted: Big,
	busy: boolean,
	onConvert: () => void,
};

/** The shown skill's climaxx, and turning its overdrive into more. */
export default function ClimaxxBalance({
	skill, climaxx, overdrive, need, converted, busy, onConvert,
}: Props) {
	return (
		<div className="climaxx">
			<div className="climaxx__amount">
				<b>{CLIMAXX_SYMBOL}<BigNum value={climaxx} theme="royal" /></b> <Trans>{skill} climaxx</Trans>
			</div>
			{need !== undefined && (
				<button className="climaxx__convert" disabled={busy || overdrive.lt(need)} onClick={onConvert}>
					<span>
						<ConvertText need={need} overdrive={overdrive} gain={conversionGain(converted, need)} />
					</span>
				</button>
			)}
		</div>
	);
}

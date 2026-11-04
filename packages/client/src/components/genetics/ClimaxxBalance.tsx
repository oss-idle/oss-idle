import { Trans } from '@lingui/react/macro';

import BigNum from '@oss-idle/shared/display/BigNum';
import {
	CLIMAXX_SYMBOL,
	conversionGain,
} from '@oss-idle/shared/genetics';

import ConvertText from './ConvertText';

type Props = {
	skill: string,
	climaxx: number,
	overdrive: number,
	/** overdrive the next tier needs; none when there is nothing to convert */
	need?: number,
	/** overdrive the skill already turned into climaxx */
	converted: number,
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
				<button className="climaxx__convert" disabled={busy || overdrive < need} onClick={onConvert}>
					<span>
						<ConvertText need={need} overdrive={overdrive} gain={conversionGain(converted, need)} />
					</span>
				</button>
			)}
		</div>
	);
}

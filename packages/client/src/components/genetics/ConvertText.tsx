import { Trans } from '@lingui/react/macro';

import type { Big } from '@oss-idle/shared/big';
import BigNum from '@oss-idle/shared/display/BigNum';
import { CLIMAXX_SYMBOL } from '@oss-idle/shared/genetics';
import { OVERDRIVE_SYMBOL } from '@oss-idle/shared/upgrades';

type Props = {
	/** overdrive the next tier needs */
	need: Big,
	overdrive: Big,
	gain: Big,
};

/** What turning overdrive into climaxx pays, or what it needs. */
export default function ConvertText({ need, overdrive, gain: earned }: Props) {
	const amount = <BigNum value={need} theme="ember" decimals={1} />;
	const gain = <BigNum value={earned} theme="royal" />;
	return overdrive.gte(need)
		? <Trans>Turn {OVERDRIVE_SYMBOL}{amount} overdrive into {CLIMAXX_SYMBOL}{gain}</Trans>
		: <Trans>Next upgrade needs {OVERDRIVE_SYMBOL}{amount} overdrive</Trans>;
}

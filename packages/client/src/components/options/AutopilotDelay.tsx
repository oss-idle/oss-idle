import { Trans } from '@lingui/react/macro';

import { AUTOPILOT_DELAY } from '@oss-idle/shared/queue';

import { SETTINGS } from '../../db/settings';
import { PBE } from '../../pbe/pbe';
import Slider from './controls/Slider';

export default function AutopilotDelay() {
	return (
		<Slider
			value={SETTINGS.autopilotDelay}
			label={<Trans>Autopilot delay</Trans>}
			min={PBE ? AUTOPILOT_DELAY.pbeMin : AUTOPILOT_DELAY.min}
			max={120}
			step={1}
			format={(n) => `${n}s`}
		/>
	);
}

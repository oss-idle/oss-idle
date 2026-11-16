import { Trans } from '@lingui/react/macro';

import type { Big } from '@oss-idle/shared/big';
import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import OverdriveNum from '@oss-idle/shared/display/OverdriveNum';

/** Where an upgrade's overdrive gain comes from: what it overspends, raised by the genes. */
export default function OverdriveGainTip({ ratio, gain }: { ratio: Big, gain: Big }) {
	const percent = Math.round(gain.div(ratio).sub(1).mul(100).toNumber());
	return <>
		<HoverCardRow label={<Trans>From overspending</Trans>}>
			+<OverdriveNum value={ratio} />
		</HoverCardRow>
		{percent > 0 && <HoverCardRow label={<Trans>From your genes</Trans>}>+{percent}%</HoverCardRow>}
	</>;
}

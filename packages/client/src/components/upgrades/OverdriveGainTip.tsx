import { Trans } from '@lingui/react/macro';

import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import OverdriveNum from '@oss-idle/shared/display/OverdriveNum';

/** Where an upgrade's overdrive gain comes from: what it overspends, raised by the genes. */
export default function OverdriveGainTip({ ratio, gain }: { ratio: number, gain: number }) {
	const percent = Math.round((gain / ratio - 1) * 100);
	return <>
		<HoverCardRow label={<Trans>From overspending</Trans>}>
			+<OverdriveNum value={ratio} />
		</HoverCardRow>
		{percent > 0 && <HoverCardRow label={<Trans>From your genes</Trans>}>+{percent}%</HoverCardRow>}
	</>;
}

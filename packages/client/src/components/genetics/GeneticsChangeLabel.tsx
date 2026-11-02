import { Trans } from '@lingui/react/macro';

type Props = { several: boolean, hours: number, free: boolean };

/** The way to the ring from the genetics tab. */
export default function GeneticsChangeLabel({ several, hours, free }: Props) {
	if (free) return <Trans>Pick another genetic</Trans>;
	if (several) {
		return hours > 0 ? <Trans>Change genetics in {hours}h</Trans> : <Trans>Change genetics</Trans>;
	}
	return hours > 0 ? <Trans>Change genetic in {hours}h</Trans> : <Trans>Change genetic</Trans>;
}

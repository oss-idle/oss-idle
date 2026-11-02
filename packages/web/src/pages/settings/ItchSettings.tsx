import {
	Plural,
	Trans,
} from '@lingui/react/macro';
import { useState } from 'react';

import { getItchClaimUrl } from '../../api/store';
import OutLink from '../../components/OutLink';

export type ItchClaim = number | 'error';

/** Claim the account's itch.io donations as supporter; `claim` is what the last one gave. */
export default function ItchSettings({ claim }: { claim?: ItchClaim }) {
	const [busy, setBusy] = useState(false);

	const start = async () => {
		setBusy(true);
		try {
			window.location.href = (await getItchClaimUrl()).url;
		} catch {
			setBusy(false);
		}
	};

	const days = typeof claim === 'number' ? Math.round(claim / 8640) / 10 : 0;

	return <>
		<div className='settings__hint'>
			<Trans>
				Donated to <OutLink href='https://adrriii.itch.io/oss-idle' target='_blank'>oss!idle on itch.io</OutLink>? Sign
				in with your itch.io account to turn your donations into oss!supporter, prorated on the
				store's prices.
			</Trans>
		</div>
		{claim === 'error' && <div className='settings__hint settings__hint--error'>
			<Trans>The claim didn't go through. Try again in a moment.</Trans>
		</div>}
		{claim === 0 && <div className='settings__hint'>
			<Trans>No new donation on this itch.io account.</Trans>
		</div>}
		{typeof claim === 'number' && claim > 0 && <div className='settings__hint settings__hint--done'>
			<Trans>Thank you! Your donations gave you <Plural value={days} one='# day' other='# days' /> of oss!supporter.</Trans>
		</div>}
		<button type='button' className='settings__button' disabled={busy} onClick={() => void start()}>
			<Trans>Claim itch.io donation</Trans>
		</button>
	</>;
}

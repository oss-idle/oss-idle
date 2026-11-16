import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import Auth from '../../online/auth';
import { rpc } from '../../online/client';
import Button from './controls/Button';

const twitchLink = async () => {
	const res = await rpc.v1.auth.twitch.$get();
	return res.ok ? await res.json() : undefined;
};

/** Links the account's Twitch. Shows nothing where the server has no Twitch app. */
export default function LinkTwitch() {
	const [user] = useSynced(Auth.user);
	const [state, setState] = useState<Awaited<ReturnType<typeof twitchLink>>>();

	useEffect(() => {
		if (user) void twitchLink().then(setState);
	}, [user]);

	if (!user || !state) return <></>;

	// A fresh URL per click: its state is single-use and short-lived.
	const open = async () => {
		const link = await twitchLink();
		if (link) window.open(link.url, '_blank');
	};

	return (
		<Button
			label={state.linked ? <Trans>Relink Twitch account</Trans> : <Trans>Link Twitch account</Trans>}
			accent="#9146ff"
			onClick={() => void open()}
		/>
	);
}

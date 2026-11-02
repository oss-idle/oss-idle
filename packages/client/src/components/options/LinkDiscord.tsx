import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import Auth from '../../online/auth';
import { rpc } from '../../online/client';
import Button from './controls/Button';
import DiscordLevelColour from './DiscordLevelColour';

const discordLink = async () => {
	const res = await rpc.v1.auth.discord.$get();
	return res.ok ? await res.json() : undefined;
};

/** Links the account's Discord, for the level role on the oss!idle server. */
export default function LinkDiscord() {
	const [user] = useSynced(Auth.user);
	const [state, setState] = useState<Awaited<ReturnType<typeof discordLink>>>();

	useEffect(() => {
		if (user) void discordLink().then(setState);
	}, [user]);

	if (!user || !state) return <></>;
	const { linked, levelColour } = state;

	// A fresh URL per click: its state is single-use and short-lived.
	const open = async () => {
		const link = await discordLink();
		if (link) window.open(link.url, '_blank');
	};

	return (
		<>
			<Button
				label={linked ? <Trans>Relink Discord account</Trans> : <Trans>Link Discord account</Trans>}
				accent="#5865f2"
				onClick={() => void open()}
			/>
			{linked && user.supporter && <DiscordLevelColour initial={levelColour} />}
		</>
	);
}

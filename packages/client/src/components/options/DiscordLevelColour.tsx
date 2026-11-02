import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import Log from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';

import { rpc } from '../../online/client';
import Checkbox from './controls/Checkbox';

const save = async (levelColour: boolean) => {
	const res = await rpc.v1.auth.discord['level-colour'].$put({ json: { levelColour } });
	if (!res.ok) Log.errorPopup(`Could not save the setting (${res.status})`);
};

/** A supporter's Discord name: their level's colour, or the Supporter pink. */
export default function DiscordLevelColour({ initial }: { initial: boolean }) {
	const [value] = useState(() => new Synced(initial));
	return <Checkbox value={value} onChange={next => void save(next)} label={
		<Trans>Keep my level colour on Discord instead of supporter pink</Trans>
	} />;
}

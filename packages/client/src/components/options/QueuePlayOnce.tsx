import { Trans } from '@lingui/react/macro';

import { SETTINGS } from '../../db/settings';
import Checkbox from './controls/Checkbox';

export default function QueuePlayOnce() {
	return <Checkbox value={SETTINGS.queuePlayOnce} label={
		<Trans>Play the queue once, stop after the last song</Trans>
	} />;
}

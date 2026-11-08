import { Trans } from '@lingui/react/macro';

import { SETTINGS } from '../../db/settings';
import Checkbox from './controls/Checkbox';

/** On: the game goes quiet while another window or tab is in front. */
export default function MuteInBackground() {
	return <Checkbox value={SETTINGS.muteInBackground} label={
		<Trans>Mute when in the background</Trans>
	} />;
}

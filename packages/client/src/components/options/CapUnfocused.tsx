import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { SETTINGS } from '../../db/settings';
import { UNFOCUSED_FPS } from '../../responsive/frameLimiter';
import Checkbox from './controls/Checkbox';

export default function CapUnfocused() {
	return <Checkbox value={SETTINGS.capUnfocused} label={
		<Trans>Limit to {ph({ fps: UNFOCUSED_FPS })} FPS when the game isn't focused</Trans>
	} />;
}

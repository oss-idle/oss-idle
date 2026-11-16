import { Trans } from '@lingui/react/macro';

import { SETTINGS } from '../../db/settings';
import {
	autopilotModeLabels,
	AutopilotModes,
} from '../../gameplay/playQueue';
import Dropdown from '../dropdown/Dropdown';
import SettingRuleset from './controls/SettingRuleset';

export default function AutopilotMode() {
	const labels = autopilotModeLabels();
	const options = AutopilotModes.map(mode => ({
		value: mode,
		label: labels[mode],
	}));
	return (
		<div className="opt-row">
			<span className="opt-row__label">
				<SettingRuleset value={SETTINGS.autopilotMode} /><Trans>Autopilot mode</Trans>
			</span>
			<Dropdown value={SETTINGS.autopilotMode} options={options} />
		</div>
	);
}

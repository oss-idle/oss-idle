import { Trans } from '@lingui/react/macro';

import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { scrollSpeedOf } from '../../db/settings';
import Slider from './controls/Slider';

/** A mania ruleset's scroll speed, the one F3 / F4 step in its plays: here for touch screens too. */
export default function ScrollSpeed({ ruleset }: { ruleset: RulesetId }) {
	return <Slider
		value={scrollSpeedOf(ruleset)} label={<Trans>Scroll speed</Trans>}
		min={1} max={40} step={1} format={v => String(v)}
	/>;
}

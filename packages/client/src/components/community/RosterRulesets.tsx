import './RosterRulesets.css';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	MODE_GLYPH,
	rulesetLabel,
	variantName,
} from '@oss-idle/shared/rulesets/display';
import { RULESETS } from '@oss-idle/shared/rulesets/ids';

import { ENABLED_RULESETS } from '../../rulesets/enabled';
import Glyph from '../multiplayer/Glyph';
import { rosterRuleset } from './state';

/** osu!'s mode icons over the roster: the ruleset whose players it lists, one at a time. */
export default function RosterRulesets() {
	const [current] = useSynced(rosterRuleset);
	return (
		<div className="roster-rulesets" role="radiogroup">
			{ENABLED_RULESETS.map(id => (
				<button
					key={id}
					type="button"
					role="radio"
					aria-checked={id === current}
					aria-label={rulesetLabel(id)}
					className={`roster-rulesets__pick${id === current ? ' is-active' : ''}`}
					onClick={() => void rosterRuleset.set(id)}
				>
					<Glyph name={MODE_GLYPH[RULESETS[id].mode]} className="roster-rulesets__icon" />
					{variantName(id) && <span className="roster-rulesets__variant">{variantName(id)}</span>}
				</button>
			))}
		</div>
	);
}

import './RulesetTag.css';

import {
	MODE_GLYPH,
	rulesetLabel,
	variantName,
} from '@oss-idle/shared/rulesets/display';
import {
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import Glyph from '../../multiplayer/Glyph';

/** The ruleset an announcement is about, in front of it: osu!'s mode icon and the key count. */
export default function RulesetTag({ ruleset }: { ruleset: RulesetId }) {
	return (
		<span className="ruleset-tag" aria-label={rulesetLabel(ruleset)}>
			<Glyph name={MODE_GLYPH[RULESETS[ruleset].mode]} className="ruleset-tag__icon" />
			{variantName(ruleset)}
		</span>
	);
}

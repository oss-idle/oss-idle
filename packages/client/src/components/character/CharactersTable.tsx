import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import type { RosterCharacter } from '@oss-idle/shared/roster';
import {
	MODE_GLYPH,
	rulesetLabel,
} from '@oss-idle/shared/rulesets/display';
import {
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import { ENABLED_RULESETS } from '../../rulesets/enabled';
import useAwayWindow from '../../scenes/useAwayWindow';
import Glyph from '../multiplayer/Glyph';
import RosterCell from './RosterCell';

/** Every character against every ruleset, each with what it plays. */
export default function CharactersTable({ characters, shown }: {
	characters: RosterCharacter[],
	/** the slot the game shows */
	shown: { id: number, ruleset: RulesetId },
}) {
	const hours = useAwayWindow();
	const columns = { gridTemplateColumns: `220px repeat(${ENABLED_RULESETS.length}, 1fr)` };
	return (
		<div className="ladder">
			<p className="ladder__hint">
				{hours === undefined
					? <Trans>
						Every character plays its queue in every mode at the same time, while the game is open.
					</Trans>
					: <Trans>
						Every character plays its queue in every mode at the same time, and keeps
						playing for {ph({ hours })} hours after you close the game.
					</Trans>}
			</p>
			<div className="roster-table">
				<div className="roster-table__row roster-table__head" style={columns}>
					<span />
					{ENABLED_RULESETS.map(id => (
						<span key={id} className={`roster-table__mode ${id === shown.ruleset ? 'is-shown' : ''}`}>
							<Glyph name={MODE_GLYPH[RULESETS[id].mode]} />
							{rulesetLabel(id)}
						</span>
					))}
				</div>
				{characters.map(c => (
					<div key={c.id} className="roster-table__row" style={columns}>
						<span className="roster-table__name">{c.name}</span>
						{ENABLED_RULESETS.map(id => <RosterCell
							key={id}
							cell={c.cells[id]}
							shown={c.id === shown.id && id === shown.ruleset}
						/>)}
					</div>
				))}
			</div>
		</div>
	);
}

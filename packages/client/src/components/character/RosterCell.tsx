import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import type { RosterCell as Cell } from '@oss-idle/shared/roster';

import RosterQueue from './RosterQueue';

export default function RosterCell({ cell, shown }: { cell?: Cell, shown: boolean }) {
	if (!cell) return <span className="roster-cell is-locked"><Trans>Not in this mode</Trans></span>;
	return (
		<span className={`roster-cell ${cell.queue?.state === 'playing' ? 'is-playing' : ''}`}>
			<span className="roster-cell__top">
				<span className="roster-cell__lv">Lv{cell.overall}</span>
				<span className="roster-cell__gen"><Trans>Gen {ph({ generation: cell.generation })}</Trans></span>
				{shown && <span className="roster-cell__tag"><Trans>Shown</Trans></span>}
			</span>
			<RosterQueue queue={cell.queue} />
		</span>
	);
}

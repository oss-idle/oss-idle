import { faPause } from '@fortawesome/free-solid-svg-icons/faPause';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	Plural,
	Trans,
} from '@lingui/react/macro';

import { length } from '@oss-idle/shared/display/length';
import type { RosterQueue as Queue } from '@oss-idle/shared/roster';

const ICON = {
	playing: faPlay, paused: faPause, stopped: faStop,
};

/** A slot's queue in one line: what plays now, or why nothing does. */
export default function RosterQueue({ queue: q }: { queue?: Queue }) {
	if (!q) return <span className="roster-queue is-off"><Trans>Nothing queued</Trans></span>;
	return (
		<span className={`roster-queue is-${q.state}`}>
			<FontAwesomeIcon icon={ICON[q.state]} />
			{q.state === 'paused' && <span><Trans>Paused</Trans></span>}
			{q.state === 'stopped' && <span><Trans>Stopped</Trans></span>}
			{q.state === 'playing' && q.title && <span className="roster-queue__map">{q.title}</span>}
			<span className="roster-queue__dim">
				<Plural value={q.maps} one="# map" other="# maps" /> · {length(q.seconds)}
			</span>
		</span>
	);
}

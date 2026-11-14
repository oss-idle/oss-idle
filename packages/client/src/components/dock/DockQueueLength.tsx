import { faClock } from '@fortawesome/free-solid-svg-icons/faClock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { length } from '@oss-idle/shared/display/length';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { passMs } from '@oss-idle/shared/queue';

import PlayQueue from '../../gameplay/playQueue';
import { selectedRate } from '../../gameplay/playRate';

/** How long one pass through the queue plays, each map at its rate and as
 *  many times as it has left. */
export default function DockQueueLength() {
	const [queue] = useSynced(PlayQueue.state);
	const [rate] = useSynced(selectedRate);
	if (!queue?.entries.length) return null;
	const ms = passMs(queue.entries, ({ beatmap: b }) =>
		b.metadata.total_length / (b.lockedRate ?? rate));
	return (
		<span className="dock__length">
			<FontAwesomeIcon icon={faClock} />
			{length(ms / 1000)}
		</span>
	);
}

import { faArrowRight } from '@fortawesome/free-solid-svg-icons/faArrowRight';
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan';
import { faListUl } from '@fortawesome/free-solid-svg-icons/faListUl';
import { faRepeat } from '@fortawesome/free-solid-svg-icons/faRepeat';
import { faShuffle } from '@fortawesome/free-solid-svg-icons/faShuffle';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import PlayQueue, {
	AUTOPILOT_MODE,
	autopilotModeLabels,
} from '../../gameplay/playQueue';
import Marquee from '../Marquee';
import DockAwayTime from './DockAwayTime';
import DockQueueLength from './DockQueueLength';
import DockRefresh from './DockRefresh';

const MODE_ICON = {
	[AUTOPILOT_MODE.DISABLED]: faBan,
	[AUTOPILOT_MODE.PLAYLIST]: faListUl,
	[AUTOPILOT_MODE.NEXT]: faArrowRight,
	[AUTOPILOT_MODE.SHUFFLE]: faShuffle,
	[AUTOPILOT_MODE.LOOP]: faRepeat,
};

/** Where the queue came from: its autopilot mode and the playlist or group,
 *  how long it plays, and a refresh once that playlist was edited. */
export default function DockSource() {
	const [queue] = useSynced(PlayQueue.state);
	if (!queue?.mode && !queue?.label && !queue?.entries.length) return null;
	return (
		<span className="dock__source">
			{queue.mode && <FontAwesomeIcon icon={MODE_ICON[queue.mode]} />}
			{queue.mode && <span>{autopilotModeLabels()[queue.mode]}</span>}
			{queue.label && <Marquee className="dock__source-label">{queue.label}</Marquee>}
			<DockRefresh />
			<DockQueueLength />
			<DockAwayTime />
		</span>
	);
}

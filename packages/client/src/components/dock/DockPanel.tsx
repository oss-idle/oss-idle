import DockModeButton from './DockModeButton';
import DockModsButton from './DockModsButton';
import DockNowPlaying from './DockNowPlaying';
import DockQueue from './DockQueue';
import DockQueueButton from './DockQueueButton';
import DockTransport from './DockTransport';
import DockUpgradesButton from './DockUpgradesButton';
import DockUpNext from './DockUpNext';

type Props = {
	/** docked to the left column while the queue carousel is open */
	left?: boolean;
	/** that carousel is song select itself, which keeps its bottom bar */
	inScene?: boolean;
	/** the scene under it has a bottom bar to stay clear of */
	aboveBar?: boolean;
};

/**
 * The dock, open: what is playing, what plays next and when, and the controls.
 *
 * Floating, it is a fixed size and never grows: the queue is managed in the
 * queue view, not here, and controls that moved under the cursor were the
 * complaint. Docked beside the queue carousel it is that view, list and all.
 */
export default function DockPanel({
	left = false,
	inScene = false,
	aboveBar = false,
}: Props) {
	return (
		<div className={[
			'dock',
			'dock--panel',
			left ? 'dock--left' : '',
			left && inScene ? 'dock--left-scene' : '',
			!left && aboveBar ? 'dock--above-bar' : '',
		].join(' ')}>
			<DockNowPlaying />
			{!left && <DockUpNext />}
			<div className="dock__bar">
				<DockTransport />
				<DockModeButton />
				<DockModsButton />
				<DockUpgradesButton />
				<DockQueueButton open={left} />
			</div>
			{left && <DockQueue hint />}
		</div>
	);
}

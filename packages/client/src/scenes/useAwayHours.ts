import useSynced from '@oss-idle/shared/hooks/useSynced';

import PlayQueue from '../gameplay/playQueue';
import PlayManager from '../online/playManager';
import useAwayWindow from './useAwayWindow';

/** How long the character keeps playing once the game is closed - none when
 *  nothing would play (signed out, option off, empty or paused queue). */
export default function useAwayHours(): number | undefined {
	const hours = useAwayWindow();
	const [queue] = useSynced(PlayQueue.state);
	const [paused] = useSynced(PlayManager.paused);
	return paused || !queue?.entries.length ? undefined : hours;
}

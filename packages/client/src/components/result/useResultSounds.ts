import { useEffect } from 'react';

import { uiSound } from '../../audio/uiSounds';
import { COUNT_UP_MS } from './CountUp';

/** the score's tick: every 10 ms at first, every 100 ms once the roll slows, louder as it does */
const tickAt = (progress: number) => {
	const ease = Math.sin(progress * Math.PI / 2);
	return {
		every: 10 + 90 * ease, volume: 0.5 + 0.5 * ease, 
	};
};

/** The score's ticks while it counts up after a play, as osu!'s total score counter plays them. */
export default function useResultSounds(fresh: boolean) {
	useEffect(() => {
		if (!fresh) return;
		const start = performance.now();
		let last = -Infinity, frame = 0;
		const step = (now: number) => {
			const progress = Math.min(1, (now - start) / COUNT_UP_MS);
			const { every, volume } = tickAt(progress);
			if (now - last >= every) {
				uiSound('results/score-tick-lesser', {
					volume, gap: 0, 
				});
				last = now;
			}
			if (progress < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, []);
}

import {
	useEffect,
	useState,
} from 'react';

const easeBoth = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** A transfer's progress, 0 to 1, from `delay` ms after it mounts and over `length` ms. */
export default function useTransfer(delay: number, length: number) {
	const [progress, setProgress] = useState(0);
	useEffect(() => {
		const start = performance.now() + delay;
		let frame = requestAnimationFrame(function step(now) {
			const p = Math.min(1, Math.max(0, (now - start) / length));
			setProgress(easeBoth(p));
			if (p < 1) frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	}, [delay, length]);
	return progress;
}

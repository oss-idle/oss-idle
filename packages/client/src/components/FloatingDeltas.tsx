import './FloatingDeltas.css';

import { useEffect } from 'react';

import num, { bignum } from '@oss-idle/shared/display/num';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { playDeltas } from '../globals';

/** Keep the node mounted until the animation has fully played out. */
const SHOW_MS = 8000;

const signed = (v: number, text: string) => `${v > 0 ? '+' : '-'}${text}`;

/** osu!stable-style floating text, shown anywhere in the client whenever a new
 *  ranked score comes back: what it moved on the profile (global rank, ranked
 *  score, pp). Drifts right, never fully opaque, fades back out. Zero lines are
 *  hidden. */
export default function FloatingDeltas() {
	const [shown] = useSynced(playDeltas);

	useEffect(() => {
		if (!shown) return;
		const timer = setTimeout(() => void playDeltas.set(undefined), SHOW_MS);
		return () => clearTimeout(timer);
	}, [shown]);

	if (!shown) return null;
	const { rank, rankedScore, pp } = shown.deltas;

	return (
		<div className="floating-deltas" key={shown.at}>
			{rank !== 0 && (
				<span className="floating-deltas__rank">
					{signed(rank, bignum(Math.abs(rank)))}
				</span>
			)}
			{rankedScore !== 0 && (
				<span className={`floating-deltas__value ${rankedScore < 0 ? 'is-loss' : ''}`}>
					{signed(rankedScore, num(Math.abs(rankedScore)))}
				</span>
			)}
			{pp !== 0 && (
				<span className={`floating-deltas__value ${pp < 0 ? 'is-loss' : ''}`}>
					{signed(pp, `${Math.abs(pp).toFixed(2)}pp`)}
				</span>
			)}
		</div>
	);
}

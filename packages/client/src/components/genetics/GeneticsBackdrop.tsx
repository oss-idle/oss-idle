import { useContext } from 'react';
import { createPortal } from 'react-dom';

import { PageBackdropSlot } from '../page/pageBar';

const W = 1280, H = 800;
const STARS = Array.from({ length: 240 }, (_, i) =>
	[(i * 397) % W, (i * 233) % H, (i % 3) * 0.5 + 0.4]);

/** The night sky behind the genes, filling the whole page whatever its shape. */
export default function GeneticsBackdrop() {
	const slot = useContext(PageBackdropSlot);
	const sky = (
		<svg className="genetics__backdrop" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
			{STARS.map(([x, y, r], i) => (
				<circle
					key={i}
					className={i % 5 === 0 ? 'genetics__twinkle' : undefined}
					style={i % 5 === 0 ? { animationDelay: `${-(i % 37) / 7}s` } : undefined}
					cx={x}
					cy={y}
					r={r}
					fill="rgba(255, 255, 255, 0.16)"
				/>
			))}
		</svg>
	);
	return slot ? createPortal(sky, slot) : sky;
}

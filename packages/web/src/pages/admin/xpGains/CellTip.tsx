import type { ReactNode } from 'react';

export type Tip = { x: number, y: number, body: ReactNode };

/** A hovered mark's numbers, beside the pointer. */
export default function CellTip({ tip }: { tip?: Tip }) {
	if (!tip) return null;
	const left = tip.x + 260 > window.innerWidth ? tip.x - 252 : tip.x + 14;
	return <div className='xp-gains__tip' style={{
		left, top: tip.y + 14,
	}}>{tip.body}</div>;
}

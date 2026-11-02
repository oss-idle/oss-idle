import type { Point } from './geneLayout';

type Look = { tier: number, max: number, open: boolean, half: boolean };

/** A gene's fill and outline: brighter the more tiers it holds, outlined when it can be bought. */
export const geneColors = ({
	tier, max, open, half,
}: Look) => {
	if (tier > 0) {
		return {
			fill: half ? 'rgba(255, 138, 183, 0.5)' : `rgba(255, 102, 171, ${0.45 + 0.55 * tier / max})`,
			stroke: '#ffd0e2',
			width: 1.5,
		};
	}
	if (!open) return {
		fill: 'rgba(20, 14, 22, 0.95)', stroke: 'rgba(255, 165, 200, 0.25)', width: 1.5, 
	};
	return {
		fill: 'rgba(20, 14, 22, 0.95)', stroke: half ? 'rgba(255, 165, 200, 0.6)' : '#ffa5c8', width: 2.2, 
	};
};

export type Label = { x: number, y: number, anchor: 'start' | 'middle' | 'end' };

/** Where a gene's name goes: under it, or along the line out from its tree's star. */
export const labelPlace = ([x, y]: Point, r: number, tiered: boolean, from?: Point): Label => {
	const below = y + r + (tiered ? 21 : 17);
	if (!from) return {
		x, y: below, anchor: 'middle', 
	};
	const dx = x - from[0], dy = y - from[1], d = Math.hypot(dx, dy) || 1;
	const ux = dx / d, uy = dy / d;
	if (Math.abs(ux) < 0.45) return {
		x, y: uy < 0 ? y - r - 8 : below, anchor: 'middle', 
	};
	return {
		x: x + ux * (r + 9), y: y + 4 + uy * 6, anchor: ux > 0 ? 'start' : 'end', 
	};
};

/** Follow the cursor for the parallax: -1 to 1 across the element, as CSS variables, set on what
 *  holds both it and the backdrop. */
export const parallax = (e: React.PointerEvent<HTMLElement>) => {
	const el = e.currentTarget, rect = el.getBoundingClientRect();
	const on = el.closest<HTMLElement>('.page, .genetic-choice__trees') ?? el;
	on.style.setProperty('--px', `${(e.clientX - rect.left) / rect.width * 2 - 1}`);
	on.style.setProperty('--py', `${(e.clientY - rect.top) / rect.height * 2 - 1}`);
};

/** A gene's classes: pickable, selected, maxed. */
export const geneClass = (pickable: boolean, selected: boolean, maxed: boolean) =>
	['gene', pickable && 'gene--pickable', selected && 'is-selected', maxed && 'is-maxed']
		.filter(Boolean).join(' ');

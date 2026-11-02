import type { Point } from './geneLayout';
import {
	type Label,
	labelPlace,
} from './geneStyle';

type Box = { left: number, right: number, top: number, bottom: number };

/** Roughly how wide the font's letters run, for the size of a name that isn't drawn yet. */
const LETTER_WIDTH = 0.62;
/** What's under a node: its tier marks. */
const MARKS = 10;

const nameBox = ({ x, y, anchor }: Label, name: string, size: number): Box => {
	const width = name.length * size * LETTER_WIDTH;
	const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
	return {
		left, right: left + width, top: y - size, bottom: y + 3, 
	};
};

const overlap = (a: Box, b: Box) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** A name's places: its usual one, then either side of its node, over and under it, and its corners. */
const placesOf = ([x, y]: Point, r: number, tiered: boolean, from?: Point): Label[] => {
	const usual = labelPlace([x, y], r, tiered, from);
	if (!from) return [usual];
	const side = r + 9, over = y - r - 8, under = y + r + (tiered ? 21 : 17);
	const place = (px: number, py: number, anchor: Label['anchor']): Label => ({
		x: px, y: py, anchor, 
	});
	return [
		usual,
		place(x + side, y + 4, 'start'),
		place(x - side, y + 4, 'end'),
		place(x, over, 'middle'),
		place(x, under, 'middle'),
		place(x + side, over, 'start'),
		place(x - side, over, 'end'),
		place(x + side, under, 'start'),
		place(x - side, under, 'end'),
	];
};

export type NamedGene = { id: string, at: Point, name: string, tiered: boolean };

/** Where each gene's name goes in a tree: its usual place unless a node or another name sits there. */
export const placeLabels = (
	genes: readonly NamedGene[],
	r: number,
	size: number,
	star?: Point,
	starRadius = 0,
): Record<string, Label> => {
	const nodes: { id?: string, box: Box }[] = genes.map(({ id, at: [x, y], tiered }) => ({
		id,
		box: {
			left: x - r, right: x + r, top: y - r, bottom: y + r + (tiered ? MARKS : 0), 
		},
	}));
	if (star) nodes.push({
		box: {
			left: star[0] - starRadius,
			right: star[0] + starRadius,
			top: star[1] - starRadius,
			bottom: star[1] + starRadius,
		},
	});
	const names: Box[] = [];
	const placed: Record<string, Label> = {};
	for (const { id, at, name, tiered } of genes) {
		const hits = (label: Label) => {
			const box = nameBox(label, name, size);
			return nodes.filter(n => n.id !== id && overlap(box, n.box)).length
				+ names.filter(other => overlap(box, other)).length;
		};
		const places = placesOf(at, r, tiered, star);
		const best = places.reduce((a, b) => (hits(b) < hits(a) ? b : a));
		placed[id] = best;
		names.push(nameBox(best, name, size));
	}
	return placed;
};

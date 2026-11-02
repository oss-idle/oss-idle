import type { Gene } from '@oss-idle/shared/genetics';

export type Point = readonly [number, number];

/** Each gene's slot across the tree (leaves spread out, a parent over its children) and depth. */
const slots = (tree: readonly Gene[]) => {
	const kids = (parent?: string) => tree.filter(g => g.parent === parent);
	const pos: Record<string, { t: number, d: number }> = {};
	let leaf = 0;
	const walk = (gene: Gene, d: number): number => {
		const children = kids(gene.id);
		if (!children.length) {
			pos[gene.id] = {
				t: leaf++, d, 
			};
			return pos[gene.id].t;
		}
		const ts = children.map(c => walk(c, d + 1));
		pos[gene.id] = {
			t: (ts[0] + ts[ts.length - 1]) / 2, d, 
		};
		return pos[gene.id].t;
	};
	for (const root of kids(undefined)) {
		walk(root, 0);
		leaf += 0.6;
	}
	return {
		pos, leaves: leaf, 
	};
};

/** A small fixed wobble per gene, so a tree reads as stars rather than a grid. */
const jitter = (id: string, amount: number) =>
	(Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 1000) / 1000 * amount
	- amount / 2;

export type Burst = {
	center: Point,
	/** distance of the roots from the center, and of each step past them */
	r0: number,
	step: number,
	/** where the burst starts and how much of the circle it covers, degrees */
	from?: number,
	span?: number,
	/** how much each step turns, degrees: chains curve */
	twist?: number,
};

/** Every gene of a tree around its skill's star. */
export const burst = (tree: readonly Gene[], {
	center: [cx, cy], r0, step, from = -90, span = 360, twist = 0,
}: Burst): Record<string, Point> => {
	const { pos, leaves } = slots(tree);
	const P: Record<string, Point> = {};
	const total = span === 360 ? leaves : leaves - 0.6;
	for (const [id, { t, d }] of Object.entries(pos)) {
		const a = (from + span * (t + 0.5) / total + twist * d) * Math.PI / 180;
		const r = r0 + d * step + jitter(id, 14);
		P[id] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
	}
	return P;
};

/** The deepest a tree goes: how far its burst reaches. */
export const depthOf = (tree: readonly Gene[]): number =>
	Math.max(0, ...Object.values(slots(tree).pos).map(p => p.d));

/** How a tree spreads around its star in the middle of the sky: deep trees stay tighter. */
export const centerBurst = (center: Point, tree: readonly Gene[]): Burst & { r: number } => {
	const depth = depthOf(tree);
	return depth > 2
		? {
			center, r0: 92, step: 50, twist: 4, r: 12,
		}
		: {
			center, r0: 84, step: 64, twist: 14, r: 14,
		};
};

/** Each gene's branches: its children, then its parent (a root: the other roots). */
export const branchLinks = (tree: readonly Gene[]): Record<string, string[]> =>
	Object.fromEntries(tree.map(g => [g.id, [
		...tree.filter(o => o.parent === g.id).map(o => o.id),
		...g.parent ? [g.parent] : tree.filter(o => !o.parent && o.id !== g.id).map(o => o.id),
	]]));

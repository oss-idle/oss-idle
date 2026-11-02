import {
	useEffect,
	useRef,
} from 'react';

import { inTextBox } from '../../input/Controls';
import {
	LAYER,
	topLayer,
} from '../../input/keyboardOwner';
import type { Point } from './geneLayout';

type Way = [number, number];

const WAYS: Record<string, Way> = {
	ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** The gene that lies most that way among `among`, from `origin`. */
const toward = (
	at: Record<string, Point>,
	among: readonly string[],
	origin: Point,
	[dx, dy]: Way,
) => {
	let best: string | undefined, score = Infinity;
	for (const id of among) {
		const [gx, gy] = at[id] ?? origin;
		const ox = gx - origin[0], oy = gy - origin[1], along = ox * dx + oy * dy;
		if (along <= 4) continue;
		const s = along + 2.5 * Math.abs(ox * dy - oy * dx);
		if (s < score) [best, score] = [id, s];
	}
	return best;
};

/** Along the branches first: the gene's parent, children and (for a root) the other roots;
 *  anywhere that way when no branch goes there. */
const step = (
	at: Record<string, Point>,
	links: Readonly<Record<string, readonly string[]>>,
	from: string | undefined,
	way: Way,
) => {
	const origin = (from && at[from]) || Object.values(at)[0];
	if (!origin) return undefined;
	if (!from) return Object.keys(at)[0];
	return toward(at, links[from] ?? [], origin, way)
		?? toward(at, Object.keys(at).filter(id => id !== from), origin, way);
};

type Keys = {
	/** the surface these keys belong to: the page by default */
	layer?: number,
	placed: { current: Record<string, Point> },
	links: Readonly<Record<string, readonly string[]>>,
	selected?: string,
	/** a confirmation is open: it has the keys */
	paused: boolean,
	select: (gene: string | undefined) => void,
	/** turn the ring by one skill */
	turn: (by: number) => void,
	learn?: (gene: string) => void,
	sell?: (gene: string) => void,
};

/** Do what `key` does; false when it does nothing here. */
const handle = (k: Keys, key: string): boolean => {
	const lower = key.toLowerCase();
	if (WAYS[key]) k.select(step(k.placed.current, k.links, k.selected, WAYS[key]) ?? k.selected);
	else if (lower === 'q' || lower === 'e') k.turn(lower === 'q' ? -1 : 1);
	else if (key === 'Enter' && k.selected && k.learn) k.learn(k.selected);
	else if ((key === 'Delete' || key === 'Backspace') && k.selected && k.sell) k.sell(k.selected);
	else return false;
	return true;
};

/** The genetics tab's keys, while the page is the topmost surface: arrows walk the branches,
 *  Q / E turn the ring, Enter learns, Delete sells. */
export default function useGeneticsKeys(keys: Keys) {
	const latest = useRef(keys);
	latest.current = keys;
	useEffect(() => {
		const press = (e: KeyboardEvent) => {
			const k = latest.current;
			const layer = k.layer ?? LAYER.PAGE;
			if (k.paused || (topLayer() ?? LAYER.PAGE) !== layer || inTextBox(e.target)) return;
			if (!handle(k, e.key)) return;
			e.preventDefault();
			e.stopPropagation();
		};
		window.addEventListener('keydown', press, { capture: true });
		return () => window.removeEventListener('keydown', press, { capture: true });
	}, []);
}

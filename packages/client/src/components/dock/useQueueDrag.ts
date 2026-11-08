import {
	type PointerEvent,
	type RefObject,
	useState,
} from 'react';

import PlayQueue from '../../gameplay/playQueue';

type Drag = { from: number; to: number };

/** On touch a row is picked up after this long held still; a swipe before it scrolls the list. */
const HOLD_MS = 300;
/** How far a finger may wander and still be holding (px). */
const SLOP = 8;

const blockScroll = (e: TouchEvent) => e.preventDefault();

/** Follow the pointer with row `from` until it is let go, then move it there. */
const carry = (
	list: RefObject<HTMLOListElement | null>,
	row: Element,
	from: number,
	setDrag: (drag: Drag | undefined) => void,
	touch: boolean,
) => {
	let to = from;
	const move = (m: globalThis.PointerEvent) => {
		const others = [...list.current!.children].filter(el => el !== row);
		to = others.filter(el => {
			const r = el.getBoundingClientRect();
			return r.top + r.height / 2 < m.clientY;
		}).length;
		setDrag({
			from, to,
		});
	};
	const up = () => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
		window.removeEventListener('touchmove', blockScroll);
		PlayQueue.move(from, to);
		setDrag(undefined);
	};
	// not pointer capture: reordering the rows moves this one in the DOM, which drops it
	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', up);
	window.addEventListener('pointercancel', up);
	if (!touch) return;
	// the row is held: the finger moves it, not the list, and it shows it is picked up
	window.addEventListener('touchmove', blockScroll, { passive: false });
	setDrag({
		from, to,
	});
};

/** A touch on a row: held still, it picks the row up; moved first, it was a scroll. */
const holdThenCarry = (x: number, y: number, pickUp: () => void) => {
	const timer = setTimeout(() => {
		release();
		pickUp();
	}, HOLD_MS);
	const wander = (m: globalThis.PointerEvent) => {
		if (Math.hypot(m.clientX - x, m.clientY - y) > SLOP) release();
	};
	const release = () => {
		clearTimeout(timer);
		window.removeEventListener('pointermove', wander);
		window.removeEventListener('pointerup', release);
		window.removeEventListener('pointercancel', release);
	};
	window.addEventListener('pointermove', wander);
	window.addEventListener('pointerup', release);
	window.addEventListener('pointercancel', release);
};

/** Rows dragged by pointer rather than native drag and drop, which would
 *  freeze the game's cursor. Returns the rows in the order to draw while one is held. */
export default function useQueueDrag<T>(list: RefObject<HTMLOListElement | null>, items: T[]) {
	const [drag, setDrag] = useState<Drag>();

	const rows = items.map((item, from) => ({
		item, from,
	}));
	if (drag) rows.splice(drag.to, 0, ...rows.splice(drag.from, 1));

	const start = (from: number) => (e: PointerEvent<HTMLLIElement>) => {
		if (e.button !== 0 || (e.target as Element).closest('button')) return;
		const row = e.currentTarget;
		if (e.pointerType === 'touch') {
			holdThenCarry(e.clientX, e.clientY, () => carry(list, row, from, setDrag, true));
			return;
		}
		e.preventDefault();
		carry(list, row, from, setDrag, false);
	};

	return {
		rows, dragging: drag?.from, start,
	};
}

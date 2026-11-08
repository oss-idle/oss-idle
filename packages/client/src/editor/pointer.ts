import type { Note } from '@oss-idle/shared/rulesets/mania/editor/chart';

import type { Overlay } from './painter';
import type EditorSession from './session';

/** Where the pointer is on the chart: its column (clamped to the field), its exact place
 *  across in columns (0 at the field's left edge, unclamped), and song time. */
export type PointerAt = { column: number, x: number, time: number, inside: boolean };

type Drag =
	| { kind: 'place', column: number, time: number, end?: number }
	| { kind: 'box', from: number, ahead: number, x: number, toX: number, add: boolean }
	| { kind: 'move', time: number, column: number, dt: number, dc: number, keepOffset: boolean }
	| { kind: 'resize', note: Note, end: number };

/**
 * What the mouse does to the chart, by the session's tool. Select: click a note to
 * select it (ctrl adds it or takes it out) and drag to move the selection onto the beat
 * lines (shift keeps each note's offset from them); drag a long
 * note's end to resize it; drag from an empty spot for a box (ctrl adds to the selection).
 * Note: click to place a note, on a note to remove it. Note + LN: the same, drag up
 * for a long note, and drag a long note's end to resize it. With any tool, a drag from
 * outside the columns is a box, and a right
 * click removes a note. A box is a plain rectangle held to song time, so scrolling while
 * dragging stretches it over the map.
 */
export default class EditorPointer {

	private drag?: Drag;
	private hover?: PointerAt;

	constructor(private readonly session: EditorSession) {}

	// the overlay is asked for every frame: these are filled in, not made anew
	private readonly shown: Overlay = {};
	private readonly ghost = {
		column: 0, time: 0, 
	};
	private readonly box = {
		from: 0, ahead: 0, left: 0, right: 0,
	};
	private moved?: {
		dt: number, dc: number, keepOffset: boolean, selected: Set<Note>, of: Note[], notes: Note[],
	};

	public overlay(): Overlay {
		const shown = this.shown;
		shown.ghost = shown.box = shown.moving = undefined;
		shown.point = this.session.hoveredPoint.get();
		const drag = this.drag;
		switch (drag?.kind) {
			case 'place':
				shown.ghost = drag;
				return shown;
			case 'box':
				shown.box = this.box;
				this.box.from = drag.from;
				this.box.ahead = drag.ahead;
				this.box.left = Math.min(drag.x, drag.toX);
				this.box.right = Math.max(drag.x, drag.toX);
				return shown;
			case 'move':
				shown.moving = this.movedBy(drag.dt, drag.dc, drag.keepOffset);
				return shown;
			case 'resize':
				shown.moving = this.resized(drag.note, drag.end);
				return shown;
		}
		const hover = this.hover;
		if (!hover?.inside || this.session.tool === 'select') return shown;
		shown.ghost = this.ghost;
		this.ghost.column = hover.column;
		this.ghost.time = this.session.snap(hover.time);
		return shown;
	}

	private resizing?: Note[];

	/** The long note at its dragged length, made again only when the end moves. */
	private resized(note: Note, end: number): Note[] {
		const shown = this.resizing?.[0];
		if (shown?.end !== end || shown.time !== note.time || shown.column !== note.column) {
			this.resizing = [{
				...note, end, 
			}];
		}
		return this.resizing!;
	}

	/** The selection shifted by the drag, worked out again only when the drag moves. */
	private movedBy(dt: number, dc: number, keepOffset: boolean): Note[] {
		const { selected, notes: of } = this.session;
		const moved = this.moved;
		if (moved?.dt === dt && moved.dc === dc && moved.keepOffset === keepOffset
			&& moved.selected === selected && moved.of === of) {
			return moved.notes;
		}
		this.moved = {
			dt, dc, keepOffset, selected, of, notes: this.session.shiftedSelection(dt, dc, keepOffset),
		};
		return this.moved.notes;
	}

	public down(at: PointerAt, button: number, ctrl: boolean, tolerance: number) {
		if (button !== 0 && button !== 2) return;
		if (!at.inside) {
			if (button === 0) this.startBox(at, ctrl);
			return;
		}
		const { tool } = this.session;
		const note = this.noteUnder(at, tolerance);
		if (button === 2) {
			if (note) this.session.remove(note);
			return;
		}
		if (!ctrl && tool !== 'note' && this.grabTail(at, tolerance)) return;
		if (tool !== 'select') {
			if (note) this.session.remove(note);
			else this.drag = {
				kind: 'place', column: at.column, time: this.session.snap(at.time),
			};
		} else if (note) {
			this.grab(note, at, ctrl);
		} else {
			this.startBox(at, ctrl);
		}
	}

	/** The note under the pointer, else, with a placing tool, the one on the line it snaps to. */
	private noteUnder(at: PointerAt, tolerance: number): Note | undefined {
		const { session } = this;
		return session.noteAt(at.time, at.column, tolerance)
			?? (session.tool === 'select' ? undefined : session.noteAt(session.snap(at.time), at.column, 1));
	}

	/** Starts resizing the long note whose end is under the pointer, if there is one. */
	private grabTail(at: PointerAt, tolerance: number): boolean {
		const tail = this.session.tailAt(at.time, at.column, tolerance);
		if (!tail) return false;
		this.session.select([tail]);
		this.drag = {
			kind: 'resize', note: tail, end: tail.end!,
		};
		return true;
	}

	private startBox(at: PointerAt, add: boolean) {
		this.drag = {
			kind: 'box', from: at.time, ahead: at.time - this.session.now(), x: at.x, toX: at.x, add,
		};
	}

	private grab(note: EditorSession['notes'][number], at: PointerAt, ctrl: boolean) {
		if (ctrl) {
			this.session.toggleSelected(note);
			return;
		}
		if (!this.session.selected.has(note)) this.session.select([note]);
		this.drag = {
			kind: 'move', time: this.session.snap(at.time), column: at.column, dt: 0, dc: 0, keepOffset: false,
		};
	}

	public get dragging(): boolean {
		return this.drag !== undefined;
	}

	/** Follow the pointer; returns whether what the drag shows changed. */
	public move(at: PointerAt, shift: boolean): boolean {
		this.hover = at;
		const drag = this.drag;
		switch (drag?.kind) {
			case 'place': return this.placeTo(drag, at);
			case 'box': return this.boxTo(drag, at);
			case 'move': return this.moveTo(drag, at, shift);
			case 'resize': return this.resizeTo(drag, at);
		}
		return false;
	}

	/** A note being placed: stretched to a long note up to the pointer (Note + LN). */
	private placeTo(drag: Extract<Drag, { kind: 'place' }>, at: PointerAt): boolean {
		const snapped = this.session.snap(at.time);
		const end = this.session.tool === 'hold' && snapped > drag.time ? snapped : undefined;
		const changed = end !== drag.end;
		drag.end = end;
		return changed;
	}

	private boxTo(drag: Extract<Drag, { kind: 'box' }>, at: PointerAt): boolean {
		const ahead = at.time - this.session.now();
		const changed = ahead !== drag.ahead || at.x !== drag.toX;
		drag.ahead = ahead;
		drag.toX = at.x;
		return changed;
	}

	private moveTo(drag: Extract<Drag, { kind: 'move' }>, at: PointerAt, keepOffset: boolean): boolean {
		const dt = this.session.snap(at.time) - drag.time;
		const dc = this.session.columnShift(at.column - drag.column);
		const changed = dt !== drag.dt || dc !== drag.dc || keepOffset !== drag.keepOffset;
		drag.dt = dt;
		drag.dc = dc;
		drag.keepOffset = keepOffset;
		return changed;
	}

	/** A long note's end: never at or before its head, keeping the last length that was one. */
	private resizeTo(drag: Extract<Drag, { kind: 'resize' }>, at: PointerAt): boolean {
		const end = this.session.snap(at.time);
		if (end <= drag.note.time || end === drag.end) return false;
		drag.end = end;
		return true;
	}

	public up() {
		const drag = this.drag;
		const { box } = this.overlay();
		this.drag = undefined;
		if (drag?.kind === 'place') this.session.place(drag.time, drag.column, drag.end);
		else if (drag?.kind === 'box' && box) {
			// the columns it touches: a column spans [c, c + 1)
			const first = Math.max(0, Math.floor(box.left));
			const last = Math.min(this.session.chart.keys - 1, Math.ceil(box.right) - 1);
			const to = this.session.now() + box.ahead;
			this.session.selectBox(Math.min(box.from, to), Math.max(box.from, to), first, last, drag.add);
		} else if (drag?.kind === 'move' && (drag.dt || drag.dc)) {
			this.session.moveSelection(drag.dt, drag.dc, drag.keepOffset);
		} else if (drag?.kind === 'resize') {
			this.session.resizeHold(drag.note, drag.end);
		}
	}

	public leave() {
		this.hover = undefined;
	}

}

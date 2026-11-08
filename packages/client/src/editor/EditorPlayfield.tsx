import {
	useEffect,
	useRef,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import {
	scrollSpeedOf,
	SETTINGS,
} from '../db/settings';
import {
	currentEditorSkin,
	currentSkin,
} from '../osu/skin/Skin';
import {
	fieldGeometry,
	timeAt,
} from './painter';
import PlayfieldLink, { sideField } from './playfieldLink';
import EditorPointer, { type PointerAt } from './pointer';
import type EditorSession from './session';
import { visualOptions } from './visualSetting';

const SHIFT_STEPS = 4;

/** The chart under edit, drawn by its own worker (see playfieldWorker) and driven by the
 *  mouse (see EditorPointer); the wheel moves along the beat lines (shift: several),
 *  ctrl + wheel zooms over the columns and goes through the snaps anywhere else. */
export default function EditorPlayfield({ session }: { session: EditorSession }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const linkRef = useRef<PlayfieldLink>(undefined);
	const [skin] = useSynced(currentSkin);
	const [editorSkin] = useSynced(currentEditorSkin);
	const skinsRef = useRef([editorSkin, skin] as const);
	skinsRef.current = [editorSkin, skin];

	useEffect(() => {
		linkRef.current?.setSkins(editorSkin, skin);
	}, [editorSkin, skin]);

	useEffect(() => {
		const host = hostRef.current!;
		// a canvas goes to a worker once: each mount draws on a new one
		const canvas = document.createElement('canvas');
		host.append(canvas);
		const link = new PlayfieldLink(canvas, session);
		linkRef.current = link;
		link.setSkins(...skinsRef.current);
		const pointer = new EditorPointer(session);
		let w = 0;
		let h = 0;

		const resize = () => {
			w = host.clientWidth;
			h = host.clientHeight;
			link.size(w, h);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		resize();

		const sync = () => link.sync();
		void session.revision.sync(sync);
		const settings = [SETTINGS.editorPreview, scrollSpeedOf(session.beatmap.ruleset()), visualOptions];
		for (const setting of settings) void setting.sync(sync);
		sync();

		const geometry = () => link.skins
			&& fieldGeometry(session.chart.keys, sideField(session), link.skins, w, h);
		// nothing to point at until the skins are decoded
		const pointed = (e: { clientX: number, clientY: number }): PointerAt | undefined => {
			const rect = host.getBoundingClientRect();
			const g = geometry();
			if (!g) return undefined;
			const x = (e.clientX - rect.left - g.x0) / g.columnWidth;
			const column = Math.floor(x);
			return {
				column: Math.min(g.keys - 1, Math.max(0, column)),
				x,
				time: timeAt(g, session.zoom, session.now(), e.clientY - rect.top),
				inside: column >= 0 && column < g.keys,
			};
		};
		// where the mouse last was, for a drag the wheel scrolls under it
		let last: { clientX: number, clientY: number, shiftKey: boolean } | undefined;
		const showPointer = () => link.overlay(pointer.overlay());

		const onDown = (e: MouseEvent) => {
			const g = geometry();
			const at = pointed(e);
			if (!g || !at) return;
			pointer.down(at, e.button, e.ctrlKey || e.metaKey, g.noteHeight / session.zoom);
			showPointer();
		};
		const move = (e: { clientX: number, clientY: number, shiftKey: boolean }) => {
			const at = pointed(e);
			return !!at && pointer.move(at, e.shiftKey);
		};
		const onMove = (e: MouseEvent) => {
			last = {
				clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey,
			};
			move(e);
			showPointer();
		};
		const onUp = () => {
			pointer.up();
			showPointer();
		};
		const onLeave = () => {
			pointer.leave();
			showPointer();
		};
		const onWheel = (e: WheelEvent) => {
			// alt + wheel is the volume
			if (e.altKey) return;
			const over = e.target === canvas;
			if (!over && !e.ctrlKey) return;
			e.preventDefault();
			const up = e.deltaY < 0;
			if (!e.ctrlKey) session.step(e.deltaY > 0 ? 1 : -1, e.shiftKey ? SHIFT_STEPS : 1);
			else if (over && pointed(e)?.inside) session.zoomBy(up ? 1.15 : 1 / 1.15);
			else session.cycleDivisor(up ? 1 : -1);
			// the chart moved under a still mouse: a drag follows it
			if (last) move(last);
			showPointer();
		};

		// while the song plays, a drag held still follows the chart moving under it
		let frame = 0;
		const follow = () => {
			frame = requestAnimationFrame(follow);
			if (!last || !pointer.dragging || !session.isPlaying) return;
			if (move(last)) showPointer();
		};
		frame = requestAnimationFrame(follow);

		void session.hoveredPoint.sync(showPointer);
		host.addEventListener('mousedown', onDown);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		host.addEventListener('mouseleave', onLeave);
		window.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			session.hoveredPoint.desync(showPointer);
			session.revision.desync(sync);
			for (const setting of settings) setting.desync(sync);
			host.removeEventListener('mousedown', onDown);
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			host.removeEventListener('mouseleave', onLeave);
			window.removeEventListener('wheel', onWheel);
			link.dispose();
			linkRef.current = undefined;
			canvas.remove();
		};
	}, [session]);

	return <div ref={hostRef} className="editor__playfield" />;
}

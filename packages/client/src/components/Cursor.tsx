import './Cursor.css';

import {
	useEffect,
	useRef,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { SETTINGS } from '../db/settings';
import { isWebOpen } from '../globals';

const TRAIL = 30;

/**
 * Replaces the system cursor with osu!'s cursor
 * plus a lerp-chain trail (cursor_trail.png) and the click "expand" effect.
 * Mouse only - hidden for touch input.
 */
export default function Cursor() {
	const rootRef = useRef<HTMLDivElement>(null);
	const trailRefs = useRef<(HTMLImageElement | null)[]>([]);
	const [webOpen] = useSynced(isWebOpen);
	const [size] = useSynced(SETTINGS.cursorSize);

	useEffect(() => {
		document.documentElement.style.setProperty('--cursor-size', String(size));
	}, [size]);

	// While the in-game browser is open, drop the custom cursor: restore the
	// system cursor (for the chrome; the iframe uses its own) and hide our cursor
	// visuals via the `web-open` class (see Cursor.css).
	useEffect(() => {
		const html = document.documentElement;
		html.classList.toggle('web-open', webOpen);
		html.classList.toggle('custom-cursor', !webOpen);
		return () => html.classList.remove('web-open');
	}, [webOpen]);

	useEffect(() => {
		document.documentElement.classList.add('custom-cursor');
		const root = rootRef.current!;

		const target = {
			x: window.innerWidth / 2, y: window.innerHeight / 2, 
		};
		const trail = Array.from({ length: TRAIL }, () => ({ ...target }));
		let shown = false;

		const show = () => {
			if (!shown) {
				shown = true;
				root.style.opacity = '1';
			}
		};

		// Only sample the latest position here; the actual transform write happens
		// once per frame in the rAF loop. Writing per-event would, on slower
		// hardware, do redundant style work for several queued events that resolve
		// to a single paint - and leave the cursor wherever the last delayed
		// handler ran rather than at the freshest sample.
		const onMove = (e: PointerEvent) => {
			target.x = e.clientX;
			target.y = e.clientY;
			show();
		};
		const onDown = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') root.classList.add('is-down');
		};
		const onUp = () => root.classList.remove('is-down');

		// pointermove, not pointerrawupdate: it's coalesced to one event right
		// before each frame, while raw updates hit-test the page at the mouse's
		// polling rate (~1 ms each over a busy DOM).
		window.addEventListener('pointermove', onMove, { passive: true });
		window.addEventListener('pointerdown', onDown);
		window.addEventListener('pointerup', onUp);

		let raf = 0;
		// a still cursor writes nothing: a new style string every frame is garbage
		let drawnX = NaN;
		let drawnY = NaN;
		const loop = () => {
			if (target.x !== drawnX || target.y !== drawnY) {
				root.style.transform = `translate(${target.x}px, ${target.y}px)`;
				drawnX = target.x;
				drawnY = target.y;
			}
			let px = target.x;
			let py = target.y;
			for (let i = 0; i < TRAIL; i++) {
				const t = trail[i];
				const dx = (px - t.x) * 0.35;
				const dy = (py - t.y) * 0.35;
				if (Math.abs(dx) + Math.abs(dy) > 0.01) {
					t.x += dx;
					t.y += dy;
					const el = trailRefs.current[i];
					if (el) el.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -50%)`;
				}
				px = t.x;
				py = t.y;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			document.documentElement.classList.remove('custom-cursor');
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointerup', onUp);
			cancelAnimationFrame(raf);
		};
	}, []);

	return (
		<>
			{Array.from({ length: TRAIL }).map((_, i) => (
				<img
					key={i}
					ref={(el) => { trailRefs.current[i] = el; }}
					className="cursor-trail"
					src={`${import.meta.env.BASE_URL}cursor_trail.png`}
					style={{ opacity: (1 - i / TRAIL) * 0.15 }}
					draggable={false}
					aria-hidden
				/>
			))}
			<div ref={rootRef} className="cursor" aria-hidden>
				<div className="cursor__inner">
					{/* only cursor.png spins + grows on click; the middle stays put */}
					<div className="cursor__outer-wrap">
						<img
							className="cursor__outer"
							src={`${import.meta.env.BASE_URL}cursor.png`}
							draggable={false}
						/>
					</div>
					<img
						className="cursor__middle"
						src={`${import.meta.env.BASE_URL}cursor_middle.png`}
						draggable={false}
					/>
				</div>
			</div>
		</>
	);
}

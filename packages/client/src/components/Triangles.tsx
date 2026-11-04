import {
	useEffect,
	useRef,
} from 'react';

import type { Parallax } from '@oss-idle/shared/hooks/useParallax';

import { sizeCanvas } from '../sizeCanvas';

interface Triangle {
	x: number // 0..1 horizontal position
	y: number // pixels from top
	size: number
	speed: number
	depth: number // 0 (far) .. 1 (near) - drives parallax + colour
	spin: number
	rot: number
	fill: string
}

interface Props {
	parallax: Parallax
	/** multiplies triangle drift speed - bumps briefly on each beat */
	intensity?: number
	/** density of triangles */
	count?: number
}

const PINKS = [
	[255, 102, 171],
	[204, 82, 136],
	[255, 166, 208],
	[180, 70, 120],
];

const fillOf = (depth: number) => {
	const [r, g, b] = PINKS[Math.floor(depth * PINKS.length) % PINKS.length];
	return `rgba(${r}, ${g}, ${b}, ${0.05 + depth * 0.16})`;
};

/**
 * The osu! signature: soft triangles slowly drifting upward. Nearer triangles
 * (higher depth) are larger, brighter and react more strongly to parallax.
 */
export default function Triangles({ 
	parallax, 
	intensity = 1, 
	count = 64, 
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const trianglesRef = useRef<Triangle[]>([]);
	const parallaxRef = useRef(parallax);
	const intensityRef = useRef(intensity);
	parallaxRef.current = parallax;
	intensityRef.current = intensity;

	useEffect(() => {
		const canvas = canvasRef.current!;
		const ctx = canvas.getContext('2d')!;
		let raf = 0;
		let w = 0;
		let h = 0;
		let dpr = 1;
		const resize = () => {
			w = window.innerWidth;
			h = window.innerHeight;
			dpr = sizeCanvas(canvas, ctx, w, h);
		};
		resize();
		window.addEventListener('resize', resize);

		// in place: a new triangle per respawn is garbage
		const spawn = (t: Triangle, initial: boolean): Triangle => {
			const depth = Math.random();
			t.x = Math.random();
			t.y = initial ? Math.random() * h : h + Math.random() * 120;
			t.size = 24 + depth * 150;
			t.speed = 14 + depth * 46;
			t.depth = depth;
			t.spin = (Math.random() - 0.5) * 0.4;
			t.rot = Math.random() * Math.PI * 2;
			t.fill = fillOf(depth);
			return t;
		};

		trianglesRef.current = Array.from({ length: count }, () => spawn({} as Triangle, true));

		let last = performance.now();
		const draw = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			ctx.clearRect(0, 0, w, h);

			const px = parallaxRef.current.x;
			const py = parallaxRef.current.y;
			const boost = intensityRef.current;

			const triangles = trianglesRef.current;
			for (let i = 0; i < triangles.length; i++) {
				const t = triangles[i];
				t.y -= t.speed * dt * boost;
				t.rot += t.spin * dt;
				if (t.y + t.size < -40) spawn(t, false);

				// parallax: nearer triangles shift more
				const shift = 40 * t.depth;
				const screenX = t.x * w - px * shift;
				const screenY = t.y - py * shift * 0.6;

				const c = Math.cos(t.rot) * dpr;
				const s = Math.sin(t.rot) * dpr;
				ctx.setTransform(c, s, -s, c, screenX * dpr, screenY * dpr);
				ctx.beginPath();
				const size = t.size;
				// equilateral-ish triangle centred on origin
				ctx.moveTo(0, -size * 0.6);
				ctx.lineTo(size * 0.52, size * 0.4);
				ctx.lineTo(-size * 0.52, size * 0.4);
				ctx.closePath();
				ctx.fillStyle = t.fill;
				ctx.fill();
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);

		return () => {
			window.removeEventListener('resize', resize);
			cancelAnimationFrame(raf);
		};
	}, [count]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
			}}
		/>
	);
}

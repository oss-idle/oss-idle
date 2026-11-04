import type { CSSProperties } from 'react';

type Rgb = readonly [number, number, number];

/** The colour at 1k, 1M, 1B and 1T. */
export const BIG_THEMES = {
	heat: [[255, 234, 160], [255, 193, 74], [255, 122, 74], [255, 79, 110]],
	cold: [[207, 232, 255], [127, 208, 255], [111, 157, 255], [177, 140, 255]],
	aurora: [[190, 240, 170], [95, 230, 190], [95, 200, 255], [200, 150, 255]],
	ocean: [[200, 245, 240], [90, 220, 210], [60, 160, 230], [80, 100, 240]],
	forest: [[215, 245, 190], [150, 225, 120], [80, 200, 120], [30, 170, 140]],
	toxic: [[235, 255, 170], [200, 255, 90], [120, 255, 120], [60, 255, 200]],
	candy: [[255, 205, 230], [255, 140, 200], [200, 140, 255], [110, 220, 255]],
	ember: [[255, 215, 190], [255, 150, 90], [230, 80, 60], [200, 40, 80]],
	royal: [[230, 215, 255], [190, 150, 255], [150, 100, 240], [255, 210, 100]],
	frost: [[240, 245, 255], [200, 225, 255], [160, 200, 255], [220, 240, 255]],
} satisfies Record<string, readonly Rgb[]>;

export type BigTheme = keyof typeof BIG_THEMES;

// glow radius (px) and strength at 1k, 1M, 1B and 1T
const GLOW = [0, 0, 6, 9];
const GLOW_ALPHA = [0, 0, 0.5, 0.7];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The colour of a big number: none under 1000, then sliding through the theme with
 *  each power of 1000. */
export const bigStyle = (n: number, theme: BigTheme): CSSProperties | undefined => {
	if (!(n >= 1000)) return undefined;
	const x = Math.min((Math.log10(n) - 3) / 3, 3);
	const i = Math.min(Math.floor(x), 2);
	const t = x - i;
	const stops = BIG_THEMES[theme];
	const rgb = stops[i].map((v, j) => Math.round(lerp(v, stops[i + 1][j], t))).join(', ');
	const glow = lerp(GLOW[i], GLOW[i + 1], t);
	const alpha = lerp(GLOW_ALPHA[i], GLOW_ALPHA[i + 1], t);
	return glow > 0
		? {
			color: `rgb(${rgb})`, textShadow: `0 0 ${glow.toFixed(1)}px rgba(${rgb}, ${alpha.toFixed(2)})`, 
		}
		: { color: `rgb(${rgb})` };
};

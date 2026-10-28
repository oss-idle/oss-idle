export const compact = (value: number): string => {
	if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k`;
	return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
};

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
	const [x, y] = [hex(a), hex(b)];
	return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(' ')})`;
};
const ramp = (steps: string[], t: number) => {
	// 0/0 (nothing paid either side) reads as the ramp's start
	const at = (Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t))) * (steps.length - 1);
	const i = Math.min(steps.length - 2, Math.floor(at));
	return mix(steps[i], steps[i + 1], at - i);
};

/** Sequential blue for the dark surface: low recedes into it, high is light. */
const BLUES = ['#16325a', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
export const sequential = (t: number) => ramp(BLUES, t);
/** Ink that reads on a sequential cell. */
export const inkOn = (t: number) => (t > 0.62 ? '#10243f' : 'hsl(var(--hsl-c1))');

/** Diverging around parity: blue pays less than accuracy, red more, gray even. */
const BELOW = ['#4a4442', '#2a5fa8', '#6da7ec'];
const ABOVE = ['#4a4442', '#b23a3a', '#f09090'];
/** `ratio` from parity, full colour at a quarter or four times. */
export const diverging = (ratio: number) => {
	const t = Math.log2(ratio) / 2;
	return t < 0 ? ramp(BELOW, -t) : ramp(ABOVE, t);
};
/** Ink that reads on a diverging cell. */
export const inkOnRatio = (ratio: number) =>
	(Math.abs(Math.log2(ratio)) > 1.4 ? '#1d1414' : 'hsl(var(--hsl-c1))');

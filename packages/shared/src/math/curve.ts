/** Straight lines through `[x, y]` points, x ascending. Past the last point
 *  its slope carries on, so a curve through rising points never stalls; below
 *  the first point it reads the first. */
const curve = (points: readonly (readonly [number, number])[], x: number): number => {
	let i = 1;
	while (i < points.length - 1 && x > points[i][0]) i++;
	const [x0, y0] = points[i - 1];
	const [x1, y1] = points[i];
	return y0 + (Math.max(x0, x) - x0) * (y1 - y0) / (x1 - x0);
};

export default curve;

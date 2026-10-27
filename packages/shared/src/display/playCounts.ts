/** One row of a character's monthly play counts: the UTC month and its plays. */
export type PlayCount = {
	d: string;
	plays: number;
};

/** The smallest 1/2/2.5/5 step covering `value`, so axis labels stay whole plays. */
const niceStep = (value: number) => {
	const pow = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
	const n = value / pow;
	const size = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && pow >= 10 ? 2.5 : n <= 5 ? 5 : 10;
	return Math.max(1, size * pow);
};

/** Zero-fill sparse rows into one point per UTC month, from the first play to `to`,
 *  so a lapsed player reads as the zero they earned; walked by month, never by day. */
export const monthlySeries = (rows: PlayCount[], to: Date = new Date()) => {
	if (rows.length === 0) return {
		counts: [], dates: [],
	};

	const plays = new Map(rows.map(row => [row.d, row.plays]));
	const first = rows.reduce((a, row) => (row.d < a ? row.d : a), rows[0].d);
	const current = to.toISOString().slice(0, 7);
	const last = rows.reduce((a, row) => (row.d > a ? row.d : a), current);

	const counts: number[] = [];
	const dates: string[] = [];
	let year = Number(first.slice(0, 4));
	let month = Number(first.slice(5, 7));
	const endYear = Number(last.slice(0, 4));
	const endMonth = Number(last.slice(5, 7));
	while (year < endYear || (year === endYear && month <= endMonth)) {
		const d = `${year}-${String(month).padStart(2, '0')}`;
		dates.push(d);
		counts.push(plays.get(d) ?? 0);
		if (++month > 12) {
			month = 1;
			year++;
		}
	}
	return {
		counts, dates,
	};
};

/** The y-axis: `top` is the first gridline at or above the peak, so 8 reads
 *  0/2/4/6/8 and 1,166 reads 0/500/1,000/1,500 rather than floating low in the plot. */
export const axisScale = (peak: number) => {
	const max = Math.max(peak, 1);
	const step = niceStep(max / 4);
	return {
		step, top: Math.ceil(max / step) * step,
	};
};

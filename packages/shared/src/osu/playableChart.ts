/** A hold starting at NaN or ending before it starts: stable draws only its tail, at its end,
 *  and never judges it. SV maps draw shapes with thousands of them (Wavetapper [Low-Fi], Amethyst
 *  Aurora [Aspire], BUZZ CUTZ [PER ARDUA AD ALTA]). */
export type TailOnly = { x: number, end: number };

/** The hold a hit object line is, when stable only shows its tail. */
export const tailOnlyHold = (line: string): TailOnly | undefined => {
	const fields = line.split(',');
	if (!(Number(fields[3]) & 128)) return undefined;
	const end = Number(fields[5]?.split(':')[0]);
	const start = fields[2] === 'NaN' ? NaN : Number(fields[2]);
	if (!Number.isFinite(end) || start <= end) return undefined;
	return {
		x: Number(fields[0]), end,
	};
};

/** The chart as it is played: without the holds stable never judges. Star rating and pp read
 *  this, or a map rates thousands of stacked decorations (Amethyst Aurora [Aspire]: 681 stars). */
export const playableChart = (text: string): string => {
	let section = '';
	let dropped = false;
	const lines = text.split('\n').filter((line) => {
		if (line.startsWith('[')) section = line.trim();
		if (section !== '[HitObjects]' || !tailOnlyHold(line)) return true;
		dropped = true;
		return false;
	});
	return dropped ? lines.join('\n') : text;
};

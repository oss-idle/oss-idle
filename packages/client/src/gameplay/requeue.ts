/**
 * A playlist's entries as the queue that carries on from `queue`: after the
 * entry playing now, which keeps its place - the head partway through its
 * repeats, else the back where it just went. One that left the playlist drops
 * out, and the playlist carries on from the next queued entry still in it.
 * With `once` the played ones are gone: it carries on from the next queued
 * entry to the playlist's end.
 */
export const requeue = <T extends { played?: number }>(
	pool: T[],
	queue: T[],
	same: (a: T, b: T) => boolean,
	order: (rest: T[]) => T[] = rest => rest,
	once = false,
): T[] => {
	if (once) {
		const next = queue.find(e => pool.some(p => same(p, e)));
		// ponytail: a shuffled queue also restarts from there, so maps shuffled after it and not played yet drop
		return next ? order(pool.slice(pool.findIndex(p => same(p, next)))) : [];
	}
	const midRun = !!queue[0]?.played;
	const current = midRun ? queue[0] : queue[queue.length - 1];
	const at = current ? pool.findIndex(p => same(p, current)) : -1;
	if (!current || at < 0) {
		const next = queue.find(e => pool.some(p => same(p, e)));
		const from = next ? pool.findIndex(p => same(p, next)) : 0;
		return order([...pool.slice(from), ...pool.slice(0, from)]);
	}
	const rest = order([...pool.slice(at + 1), ...pool.slice(0, at)]);
	return midRun ? [current, ...rest] : [...rest, current];
};

import type { Refusal } from './api/simulate';
import type {
	SimInput,
	SimResult,
} from './rulesets/mania/4k/simState';

/**
 * The sim services (simService.ts) the sim API sends its plays to, in order of preference:
 * each takes what its threads can play and answers 429 at once past that, so a request
 * goes to the first one with a free thread and the later ones only take the overflow.
 * One that can't be reached is left out for a while.
 */

const DOWN_MS = 30_000;
const downUntil = new Map<string, number>();

/** Each host plays the chart from its own copy by checksum: the text goes along only when
 *  it answers that it has never had this version of the map. */
export const playOnHosts = async (
	urls: string[], secret: string, input: SimInput, chart: string,
): Promise<SimResult | Refusal> => {
	const now = Date.now();
	const up = urls.filter(url => (downUntil.get(url) ?? 0) <= now);
	let busy = false;
	// every host down: try them all anyway rather than refuse
	for (const url of up.length ? up : urls) {
		const send = (body: SimInput & { chart?: string }) => fetch(`${url}/simulate`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(20_000),
		}).catch((e: unknown) => {
			console.error(`[simulate] ${url} unreachable:`, e);
			return undefined;
		});
		let res = await send(input);
		if (res?.status === 409) res = await send({
			...input, chart,
		});
		if (res?.ok) {
			downUntil.delete(url);
			return await res.json() as SimResult;
		}
		if (res?.status === 429) {
			busy = true;
			continue;
		}
		if (res) console.error(`[simulate] ${url} answered`, res.status, await res.text());
		// no answer, or its proxy's: the service is down (a play that failed is not)
		if (!res || res.status >= 502) downUntil.set(url, Date.now() + DOWN_MS);
	}
	return busy
		? {
			status: 429, error: 'Every simulation server is busy, try again soon',
		}
		: {
			status: 503, error: 'Simulations are unavailable right now',
		};
};

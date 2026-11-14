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

type SimBody = SimInput & { chart?: string };

const send = (url: string, secret: string, body: SimBody) => fetch(`${url}/simulate`, {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json',
	},
	body: JSON.stringify(body),
	signal: AbortSignal.timeout(20_000),
}).catch(() => undefined);

/** One host's go at the play. It plays the chart from its own copy by checksum: the text goes
 *  along only when it answers that it has never had this version of the map. */
const playOn = async (
	url: string, secret: string, input: SimInput, chart: string,
): Promise<SimResult | 'busy' | 'failed'> => {
	let res = await send(url, secret, input);
	if (res?.status === 409) res = await send(url, secret, {
		...input, chart,
	});
	if (res?.ok) {
		downUntil.delete(url);
		return await res.json() as SimResult;
	}
	if (res?.status === 429) return 'busy';
	// no answer, or its proxy's: the service is down or restarting (a deploy), the next one plays it
	if (!res || res.status >= 502) {
		if ((downUntil.get(url) ?? 0) <= Date.now()) {
			console.warn(`[simulate] ${url} not answering, left out for ${DOWN_MS / 1000}s`);
		}
		downUntil.set(url, Date.now() + DOWN_MS);
		return 'failed';
	}
	console.error(`[simulate] error: ${url} answered`, res.status, await res.text());
	return 'failed';
};

export const playOnHosts = async (
	urls: string[], secret: string, input: SimInput, chart: string,
): Promise<SimResult | Refusal> => {
	const now = Date.now();
	const up = urls.filter(url => (downUntil.get(url) ?? 0) <= now);
	let busy = false;
	// then the ones left out rather than refuse: a deploy restarts them seconds apart
	const order = [...up, ...urls.filter(url => !up.includes(url))];
	for (const [i, url] of order.entries()) {
		if (busy && i >= up.length) break;
		const played = await playOn(url, secret, input, chart);
		if (played === 'busy') busy = true;
		else if (played !== 'failed') return played;
	}
	if (busy) return {
		status: 429, error: 'Every simulation server is busy, try again soon',
	};
	console.error('[simulate] error: no sim host could play it');
	return {
		status: 503, error: 'Simulations are unavailable right now',
	};
};

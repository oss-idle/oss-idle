import {
	afterEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import type { SimInput } from '../../server/src/rulesets/mania/4k/simState';
import { playOnHosts } from '../../server/src/simHosts';

const input = {
	checksum: 'c'.repeat(64), state: {}, rate: 1, mods: [],
} as unknown as SimInput;

/** Hosts answering in turn: a status, or undefined for one that can't be reached. */
const hosts = (answers: Record<string, (number | undefined)[]>) => {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		const host = new URL(url).host;
		const sent = JSON.parse(init.body as string) as { chart?: string };
		calls.push(sent.chart === undefined ? host : `${host}+chart`);
		const status = answers[host]!.shift();
		if (status === undefined) throw new Error('unreachable');
		return new Response(JSON.stringify(status === 200 ? { score: host } : { error: 'x' }), { status });
	});
	return calls;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the sim API across several sim services', () => {
	it('fills the first service, the next ones take what it is too busy for', async () => {
		const calls = hosts({
			a: [200, 429], b: [200],
		});
		const urls = ['http://a', 'http://b'];
		expect(await playOnHosts(urls, 's', input, 'text')).toEqual({ score: 'a' });
		expect(await playOnHosts(urls, 's', input, 'text')).toEqual({ score: 'b' });
		expect(calls).toEqual(['a', 'a', 'b']);
	});

	it('sends the chart to the one that never had it, and says busy when all are', async () => {
		const calls = hosts({
			c: [409, 429], d: [429],
		});
		expect(await playOnHosts(['http://c', 'http://d'], 's', input, 'text')).toMatchObject({ status: 429 });
		expect(calls).toEqual(['c', 'c+chart', 'd']);
	});

	it('leaves out a service that is down, and tries it again when none is up', async () => {
		const calls = hosts({
			e: [undefined, 200], f: [200, 503],
		});
		const urls = ['http://e', 'http://f'];
		expect(await playOnHosts(urls, 's', input, 'text')).toEqual({ score: 'f' });
		expect(await playOnHosts(urls, 's', input, 'text')).toMatchObject({ status: 503 });
		expect(await playOnHosts(urls, 's', input, 'text')).toEqual({ score: 'e' });
		expect(calls).toEqual(['e', 'f', 'f', 'e']);
	});
});

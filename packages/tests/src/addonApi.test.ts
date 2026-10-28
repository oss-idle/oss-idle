import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { addonApi } from '@oss-idle/client/addons/api';

vi.mock('@oss-idle/client/online/client', () => ({ BASE_URL: 'https://api.test' }));
vi.mock('@oss-idle/client/rulesets/registry', () => ({ selectedRuleset: { get: () => 'osu' } }));

const calls: { url: string, init?: RequestInit }[] = [];
vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
	calls.push({
		url, init,
	});
	const status = url.includes('fail') ? 401 : 200;
	return new Response('{"characters":[],"news_posts":[]}', { status });
});

const last = () => calls.at(-1)!;
const V2 = 'https://api.test/api/v2';

describe('addonApi', () => {
	it('asks about the picked ruleset, as osu!\'s mode and variant', async () => {
		await addonApi.me();
		expect(last().url).toBe(`${V2}/me?mode=osu`);
		await addonApi.userScores('some name', 'best', {
			ruleset: 'mania4k', limit: 5,
		});
		expect(last().url).toBe(`${V2}/users/%40some%20name/scores/best?mode=mania&variant=4k&limit=5`);
	});

	it('repeats list parameters', async () => {
		await addonApi.characters([1, 2]);
		expect(last().url).toBe(`${V2}/characters?mode=osu&ids%5B%5D=1&ids%5B%5D=2`);
	});

	it('posts JSON with the session', async () => {
		await addonApi.simulate({ beatmap_id: 7 });
		expect(last().init).toMatchObject({
			method: 'POST', body: '{"beatmap_id":7}', credentials: 'include',
		});
	});

	it('fails with the status', async () => {
		await expect(addonApi.newsPost('fail')).rejects.toMatchObject({ status: 401 });
	});
});

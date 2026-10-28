import {
	failoverFetch,
	json,
	withAuth,
} from '@oss-idle/shared/apiBase';
import type {
	AddonApi,
	ApiBoardScore,
	ApiNewsPost,
	ApiUser,
	ListOption,
	RankingOption,
	RulesetOption,
	UserRef,
} from '@oss-idle/shared/apiV2';
import { RULESETS } from '@oss-idle/shared/rulesets/ids';

import { BASE_URL } from '../online/client';
import { selectedRuleset } from '../rulesets/registry';

type Query = Record<string, string | number | number[] | undefined>;

// no retries: an add-on hears of a failure at once
const send = failoverFetch((input, init) => fetch(input, withAuth(init)));

const get = async <T>(path: string, query: Query = {}): Promise<T> => {
	const url = new URL(`${BASE_URL}/api/v2${path}`);
	for (const [key, value] of Object.entries(query)) {
		for (const v of [value].flat()) if (v !== undefined) url.searchParams.append(key, String(v));
	}
	return json<T>(await send(url.href));
};

const post = async <T>(path: string, body: unknown): Promise<T> =>
	json<T>(await send(`${BASE_URL}/api/v2${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	}));

/** osu!'s `mode` and `variant` for a ruleset. */
const mode = ({ ruleset = selectedRuleset.get() }: RulesetOption = {}): Query => {
	const { mode, variant }: { mode: string, variant?: string } = RULESETS[ruleset];
	return {
		mode, variant,
	};
};

const list = (options: ListOption = {}): Query => ({
	...mode(options), limit: options.limit, offset: options.offset,
});

const ranking = (options: RankingOption = {}): Query => ({
	...mode(options), country: options.country, 'cursor[page]': options.page,
});

const userParam = (user: UserRef) =>
	encodeURIComponent(typeof user === 'number' ? String(user) : `@${user}`);

const board = async (id: number, country?: string) =>
	(await get<{ scores: ApiBoardScore[] }>(`/beatmaps/${id}/scores`, { country })).scores;

export const addonApi: AddonApi = {
	me: options => get('/me', mode(options)),
	friends: () => get('/friends'),
	simulate: body => post('/simulate', body),
	user: (user, options) => get(`/users/${userParam(user)}`, mode(options)),
	userScores: (user, type, options) => get(`/users/${userParam(user)}/scores/${type}`, list(options)),
	characters: async (ids, options) =>
		(await get<{ characters: ApiUser[] }>('/characters', {
			...mode(options), 'ids[]': ids,
		})).characters,
	character: (id, options) => get(`/characters/${id}`, mode(options)),
	characterScores: (id, type, options) => get(`/characters/${id}/scores/${type}`, list(options)),
	beatmap: id => get(`/beatmaps/${id}`),
	beatmapLookup: osuId => get('/beatmaps/lookup', { osu_id: osuId }),
	beatmapScores: (id, options) => board(id, options?.country),
	beatmapset: (id, options) => get(`/beatmapsets/${id}`, mode(options)),
	rankings: (type, options) => get(`/rankings/${type}`, ranking(options)),
	skillRankings: (skill, options) =>
		get(`/rankings/skill/${encodeURIComponent(skill)}`, ranking(options)),
	countryRankings: options => get('/rankings/country', ranking(options)),
	match: id => get(`/matches/${id}`),
	news: async options =>
		(await get<{ news_posts: ApiNewsPost[] }>('/news', list(options))).news_posts,
	newsPost: slug => get(`/news/${encodeURIComponent(slug)}`),
};

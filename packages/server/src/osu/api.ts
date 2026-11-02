import { env } from '../env';

/**
 * Every osu! API call goes through the scheduler (`OSU_API_URL`, else
 * `OSU_API_FALLBACK_URL`), never
 * osu.ppy.sh directly: the rate limit is per IP and this host runs several osu!
 * projects, so one shared budget is scheduled in one place.
 *
 * Two token flavours ride the same path - a user's token (the OAuth login) or
 * this app's own client-credentials token, cached here until it expires.
 */

type Priority = 'realtime' | 'interactive' | 'high' | 'normal';

const TOKEN_URL = 'https://osu.ppy.sh/oauth/token';

export class SchedulerError extends Error {}

const SCHEDULERS = [
	{
		url: env.OSU_API_URL, token: env.OSU_SCHEDULER_TOKEN,
	},
	...env.OSU_API_FALLBACK_URL && env.OSU_SCHEDULER_FALLBACK_TOKEN
		? [{
			url: env.OSU_API_FALLBACK_URL, token: env.OSU_SCHEDULER_FALLBACK_TOKEN,
		}]
		: [],
];

/** Call an osu! API path (e.g. `api/v2/me`) with an osu! access token, through the
 *  first scheduler that answers: the next one only gets requests that never reached osu!. */
export const osuApi = async <T>(
	path: string,
	priority: Priority,
	token: string,
	headers: Record<string, string> = {},
): Promise<T> => {
	let error: Error = new SchedulerError('no scheduler');
	for (const scheduler of SCHEDULERS) {
		const res = await fetch(`${scheduler.url}/${path.replace(/^\//, '')}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
				'X-Scheduler-Token': scheduler.token,
				'X-Osu-Priority': priority,
				'User-Agent': 'oss-idle/1.0',
				...headers,
			},
		}).catch((e: Error) => e);
		if (res instanceof Error) {
			error = new SchedulerError(res.message);
			continue;
		}
		// Set only when the request never reached osu!, so it is safe to retry.
		const failed = res.headers.get('x-scheduler-error');
		// the scheduler itself is down behind its proxy
		if (failed || res.status === 502 || res.status === 503) {
			error = new SchedulerError(failed ?? `scheduler returned ${res.status}`);
			continue;
		}
		if (!res.ok) throw new Error(`osu! returned ${res.status}`);
		return await res.json() as T;
	}
	throw error;
};

let appToken: { value: string; expiresAt: number } | undefined;

/** This app's client-credentials token (public scope), cached until it expires. */
const getAppToken = async (): Promise<string> => {
	if (appToken && appToken.expiresAt > Date.now()) return appToken.value;

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json', Accept: 'application/json',
		},
		body: JSON.stringify({
			client_id: env.OSU_CLIENT_ID,
			client_secret: env.OSU_CLIENT_SECRET,
			grant_type: 'client_credentials',
			scope: 'public',
		}),
	});
	if (!res.ok) throw new Error(`osu! client token failed: ${res.status}`);

	const data = await res.json() as { access_token: string; expires_in: number };
	// Expire a minute early so a token can't die mid-flight.
	appToken = {
		value: data.access_token,
		expiresAt: Date.now() + (data.expires_in - 60) * 1000,
	};
	return appToken.value;
};

export type OsuBeatmapsetDiff = {
	id: number;
	mode_int: number;
	cs: number;
	version: string;
	difficulty_rating: number;
};

export type OsuBeatmapset = {
	id: number;
	artist: string;
	title: string;
	creator: string;
	/** the mapper's osu! user id */
	user_id: number;
	status: string;
	beatmaps?: OsuBeatmapsetDiff[];
};

/** A score on a map, as osu! sends it in SCORE_VERSION's format. */
export type OsuMapScore = {
	id: number;
	user_id: number;
	beatmap_id: number;
	ruleset_id: number;
	ended_at: string;
	accuracy: number;
	pp?: number | null;
	rank: string;
	max_combo: number;
	total_score: number;
	legacy_total_score: number;
	mods: { acronym: string }[];
	statistics: {
		perfect?: number;
		great?: number;
		good?: number;
		ok?: number;
		meh?: number;
		miss?: number;
	};
};

/** A score from one of a player's lists, with its map. */
export type OsuUserScore = OsuMapScore & {
	beatmap: { id: number; cs: number; difficulty_rating: number; total_length: number };
};

const SCORE_VERSION = { 'x-api-version': '20220705' };

const PAGE = 100;

/** A page of a player's osu!mania scores: `best` is best first, and osu! stops it at 200. */
export const fetchUserScores = async (
	userId: number,
	type: 'best' | 'firsts',
	offset = 0,
): Promise<OsuUserScore[]> => osuApi<OsuUserScore[]>(
	`api/v2/users/${userId}/scores/${type}?mode=mania&limit=${PAGE}&offset=${offset}`,
	'normal',
	await getAppToken(),
	SCORE_VERSION,
);

/** A map from a player's play history, most played first. */
export type OsuPlayedMap = {
	beatmap_id: number;
	count: number;
	beatmap: { mode: string; difficulty_rating: number };
};

/** A page of a player's play history, across every mode. */
export const fetchPlayedMaps = async (
	userId: number,
	offset: number,
): Promise<OsuPlayedMap[]> => osuApi<OsuPlayedMap[]>(
	`api/v2/users/${userId}/beatmapsets/most_played?limit=${PAGE}&offset=${offset}`,
	'normal',
	await getAppToken(),
);

type OsuMapKeys = {
	id: number;
	cs: number;
	difficulty_rating: number;
	version: string;
	beatmapset: Pick<OsuBeatmapset, 'id' | 'artist' | 'title'>;
};

/** Up to 50 maps at a time, with their key counts and difficulty. */
export const fetchMapKeys = async (
	ids: readonly number[],
): Promise<OsuMapKeys[]> => {
	const { beatmaps } = await osuApi<{ beatmaps: OsuMapKeys[] }>(
		`api/v2/beatmaps?${ids.map(id => `ids[]=${id}`).join('&')}`,
		'normal',
		await getAppToken(),
		{},
	);
	return beatmaps;
};

/** A player's scores on one map, whichever mods they were set with. */
export const fetchMapScores = async (
	beatmapId: number,
	userId: number,
): Promise<OsuMapScore[]> => {
	const { scores } = await osuApi<{ scores: OsuMapScore[] }>(
		`api/v2/beatmaps/${beatmapId}/scores/users/${userId}/all?mode=mania`,
		'normal',
		await getAppToken(),
		SCORE_VERSION,
	);
	return scores;
};

export type OsuManiaProfile = {
	username: string;
	statistics: { variants?: { variant: string; global_rank?: number; pp: number }[] };
};

/** A player's osu!mania profile: their rank and pp per key count. */
export const fetchManiaProfile = async (
	userId: number,
): Promise<OsuManiaProfile> => osuApi<OsuManiaProfile>(
	`api/v2/users/${userId}/mania`, 'normal', await getAppToken(),
);

/** Look a beatmapset up on osu!. Returns undefined when osu! says it's gone. */
export const fetchBeatmapset = async (setId: number): Promise<OsuBeatmapset | undefined> => {
	try {
		return await osuApi<OsuBeatmapset>(
			`api/v2/beatmapsets/${setId}`, 'interactive', await getAppToken(),
		);
	} catch (e) {
		if (e instanceof Error && e.message.includes('404')) return undefined;
		throw e;
	}
};

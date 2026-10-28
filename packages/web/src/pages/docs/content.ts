import { MATCH_EVENT } from '@oss-idle/shared/multiplayer';
import type { Scope } from '@oss-idle/shared/oauth';

import { rulesetDef } from '../../rulesets';

/** The API reference, in English only like osu!'s: not sent to Crowdin. */

export type Param = {
	name: string;
	type: 'integer' | 'integer[]' | 'string';
	optional?: boolean;
	about: string;
};

/** A request as the examples show it: `{{token}}` and the like stay placeholders. */
export type Sample = {
	method: 'GET' | 'POST';
	url: string;
	query?: Record<string, string>;
	form?: Record<string, string>;
	token?: boolean;
};

export type Endpoint = {
	id: string;
	title: string;
	path: string;
	scope: Scope;
	user?: boolean;
	about: string;
	url?: Param[];
	query?: Param[];
	example: { path: string; query?: Record<string, string> };
	response?: unknown;
	format: string;
};

export type EndpointSection = { id: string; title: string; endpoints: Endpoint[] };

/** One field of an object: name, type, description. */
export type Field = [name: string, type: string, about: string];

export type ObjectDoc = { id: string; title: string; about: string; fields: Field[] };

const USER_COMPACT = {
	id: 1375479,
	character_id: 13,
	username: 'Paturages',
	country_code: 'FR',
	avatar_url: 'https://a.ppy.sh/1375479?1786973894.png',
	profile_url: 'https://oss.idle.rhythmgamers.net/web/c/13',
};

const STATISTICS = {
	pp: 10865.984,
	global_rank: 8,
	country_rank: 5,
	ranked_score: 425127200,
	total_score: 8150559825,
	play_count: 8698,
	play_time: 1703259,
	total_hits: 22214916,
	level: {
		current: 100, progress: 18, total_xp: 2870299,
	},
	grade_counts: {
		xx: 0, x: 0, ss: 84, s: 347, a: 1,
	},
	statistics: {
		divine: 0, marvelous: 764111, perfect: 231331, great: 15867, good: 3021, bad: 412, miss: 2210,
	},
};

const USER = {
	...USER_COMPACT,
	generation: 1,
	is_supporter: false,
	support_level: 0,
	join_date: '2026-06-06T15:36:55.000Z',
	statistics: STATISTICS,
	fatigue: {
		minutes: 54.171, level: 0, at: '2026-07-07T17:56:34.000Z',
	},
	warmup: {
		level: 1, bar: 0.448,
	},
	skills: {
		stamina: {
			level: 100, progress: 42, total_xp: 5294299, prestige: 0, upgrades: 4,
		},
	},
	rank_history: {
		mode: 'mania', data: [12, 10, 9, 8],
	},
};

const BEATMAP = {
	id: 2697726,
	osu_id: 2697726,
	beatmapset_id: 1300539,
	version: 'LAPLACE//TRANSFORM',
	difficulty_rating: 8.205,
	mode: 'mania',
	status: 'ranked',
	cs: 4,
	bpm: 147,
	total_length: 413,
	count_circles: 5308,
	count_sliders: 517,
	playcount: 310,
	url: 'https://oss.idle.rhythmgamers.net/web/maps/1300539?diff=2697726',
};

const BEATMAPSET = {
	id: 1300539,
	osu_id: 1300539,
	artist: 'Camellia',
	title: 'PLANET//SHAPER',
	creator: 'Evening',
	status: 'ranked',
	ranked_date: '2026-06-16T16:01:42.000Z',
	submitted_date: '2026-06-22T10:05:56.000Z',
	covers: { cover: 'https://assets.ppy.sh/beatmaps/1300539/covers/cover.jpg' },
	url: 'https://oss.idle.rhythmgamers.net/web/maps/1300539',
};

const SCORE = {
	id: 79348,
	character_id: 13,
	beatmap_id: 2697726,
	score: 991179,
	accuracy: 0.99784,
	max_combo: 5825,
	rank: 'S',
	pp: 807.91,
	perfect: false,
	rate: 1,
	mods: ['HR'],
	statistics: {
		divine: 0, marvelous: 4749, perfect: 1041, great: 33, good: 2, bad: 0, miss: 0,
	},
	ended_at: '2026-07-07T17:56:34.000Z',
};

const LIVE_PLAY = {
	beatmap_id: 2697726,
	ruleset: 'mania4k',
	rate: 1,
	mods: ['HR'],
	ranked: true,
	started_at: '2026-07-07T17:51:27.000Z',
	ends_at: '2026-07-07T17:56:34.000Z',
	server_now: '2026-07-07T17:53:04.000Z',
	fatigue: 0,
	warmup: 1,
	warmup_bar: 0.448,
	warmup_trend: -3,
};

const RANKING_ROW = {
	rank: 1,
	...STATISTICS,
	user: USER_COMPACT,
};

const NEWS_POST = {
	id: 29,
	slug: 'beta-0-20-4',
	title: 'Beta 0.20.4',
	author: 'Adri',
	tag: 'update',
	preview: 'Screensaver mode, phones and tablets, and Discord level roles',
	published_at: '2026-10-14T22:16:58.000Z',
	updated_at: '2026-10-14T22:16:58.000Z',
	url: 'https://oss.idle.rhythmgamers.net/web/news/beta-0-20-4',
};

/** osu!'s mode, in the path where osu! puts it. */
const MODE_PARAM: Param = {
	name: 'mode', type: 'string', about: 'mania, the only mode oss! plays for now.',
};
const OPTIONAL_MODE: Param = {
	...MODE_PARAM, optional: true,
};

const USER_PARAM: Param = {
	name: 'user',
	type: 'string',
	about: 'Id of the user, or @ and the name of the character they play as (@Paturages).',
};

const CHARACTER_PARAM: Param = {
	name: 'character',
	type: 'integer',
	about: 'Id of the character: the number in a profile link (/web/c/13).',
};

const SCORE_TYPE: Param = {
	name: 'type',
	type: 'string',
	about: 'best (top plays by pp), firsts (#1s, newest first) or recent (latest plays).',
};

const LIST_QUERY: Param[] = [
	{
		name: 'limit', type: 'integer', optional: true, about: 'Maximum number of results, 1 to 100. Defaults to 50.',
	},
	{
		name: 'offset', type: 'integer', optional: true, about: 'Result offset for pagination. Defaults to 0.',
	},
];

const RANKING_QUERY: Param[] = [
	{
		name: 'country', type: 'string', optional: true, about: 'A two-letter country code, for that country\'s ranking.',
	},
	{
		name: 'cursor[page]', type: 'integer', optional: true, about: 'The page, 50 rows each. The response\'s cursor names the next one.',
	},
];

export const ENDPOINTS: EndpointSection[] = [
	{
		id: 'beatmaps',
		title: 'Beatmaps',
		endpoints: [
			{
				id: 'lookup-beatmap',
				title: 'Lookup Beatmap',
				path: '/beatmaps/lookup',
				scope: 'public',
				about: 'Returns a ranked beatmap, found by its id on osu!.',
				query: [{
					name: 'osu_id', type: 'integer', about: 'The beatmap\'s id on osu!.',
				}],
				example: {
					path: '/beatmaps/lookup', query: { osu_id: '2697726' },
				},
				format: 'See Get Beatmap.',
			},
			{
				id: 'get-beatmap-scores',
				title: 'Get Beatmap scores',
				path: '/beatmaps/{beatmap}/scores',
				scope: 'public',
				about: 'Returns the top 50 scores of a beatmap.',
				url: [{
					name: 'beatmap', type: 'integer', about: 'Id of the Beatmap.',
				}],
				query: [{
					name: 'country', type: 'string', optional: true, about: 'A two-letter country code, for that country\'s top 50.',
				}],
				example: {
					path: '/beatmaps/2697726/scores', query: { country: 'FR' },
				},
				response: {
					scores: [{
						...SCORE, user: USER_COMPACT,
					}],
				},
				format: 'Field scores: Score[], each with its user (UserCompact).',
			},
			{
				id: 'get-beatmap',
				title: 'Get Beatmap',
				path: '/beatmaps/{beatmap}',
				scope: 'public',
				about: 'Gets a ranked beatmap and its beatmapset.',
				url: [{
					name: 'beatmap', type: 'integer', about: 'Id of the Beatmap.',
				}],
				example: { path: '/beatmaps/2697726' },
				response: {
					...BEATMAP, beatmapset: BEATMAPSET,
				},
				format: 'Beatmap, with beatmapset.',
			},
		],
	},
	{
		id: 'beatmapsets',
		title: 'Beatmapsets',
		endpoints: [
			{
				id: 'get-beatmapset',
				title: 'Get Beatmapset',
				path: '/beatmapsets/{beatmapset}',
				scope: 'public',
				about: 'Gets a beatmapset and its ranked beatmaps, easiest first.',
				url: [{
					name: 'beatmapset', type: 'integer', about: 'Id of the Beatmapset.',
				}],
				example: { path: '/beatmapsets/1300539' },
				response: {
					...BEATMAPSET, beatmaps: [BEATMAP],
				},
				format: 'Beatmapset, with beatmaps.',
			},
		],
	},
	{
		id: 'matches',
		title: 'Matches',
		endpoints: [
			{
				id: 'get-match',
				title: 'Get Match',
				path: '/matches/{match}',
				scope: 'public',
				about: 'Returns a multiplayer match\'s history: who came and went, and every game with its scores. A private match is only returned to its players.',
				url: [{
					name: 'match', type: 'integer', about: 'Id of the match.',
				}],
				example: { path: '/matches/1' },
				response: {
					match: {
						id: 1, name: 'Adri\'s game', start_time: '2026-10-10T12:52:58.982Z', end_time: '2026-10-10T12:58:14.520Z',
					},
					events: [
						{
							id: 1, type: 'create', timestamp: '2026-10-10T12:52:58.983Z', character_id: 2,
						},
						{
							id: 2,
							type: 'game',
							timestamp: '2026-10-10T12:53:30.000Z',
							game: {
								beatmap_id: 2697726,
								start_time: '2026-10-10T12:53:30.000Z',
								end_time: '2026-10-10T12:57:00.000Z',
								scores: [{
									character_id: 2,
									score: 991179,
									accuracy: 0.99784,
									max_combo: 5825,
									rank: 'S',
									passed: true,
									statistics: {
										divine: 0, marvelous: 4749, perfect: 1041, great: 33, good: 2, bad: 0, miss: 0,
									},
								}],
							},
						},
					],
					users: [{
						character_id: 2, username: 'Adri', country_code: 'FR',
					}],
				},
				format: 'Fields match, events (MatchEvent[]) and users.',
			},
		],
	},
	{
		id: 'news',
		title: 'News',
		endpoints: [
			{
				id: 'get-news-listing',
				title: 'Get News Listing',
				path: '/news',
				scope: 'public',
				about: 'Returns published news posts, newest first.',
				query: LIST_QUERY,
				example: {
					path: '/news', query: { limit: '12' },
				},
				response: { news_posts: [NEWS_POST] },
				format: 'Field news_posts: NewsPost[].',
			},
			{
				id: 'get-news-post',
				title: 'Get News Post',
				path: '/news/{news}',
				scope: 'public',
				about: 'Returns one news post, with its content.',
				url: [{
					name: 'news', type: 'string', about: 'The post\'s slug.',
				}],
				example: { path: '/news/beta-0-20-4' },
				response: {
					...NEWS_POST, content: '<h2>Major Features</h2>…',
				},
				format: 'NewsPost, with content.',
			},
		],
	},
	{
		id: 'ranking',
		title: 'Ranking',
		endpoints: [
			{
				id: 'get-ranking',
				title: 'Get Ranking',
				path: '/rankings/{mode}/{type}',
				scope: 'public',
				about: 'Gets the players ranked on pp, ranked score or medals.',
				url: [MODE_PARAM, {
					name: 'type',
					type: 'string',
					about: 'performance, score or medals. Rows of the medals ranking add medals: { held, score }.',
				}],
				query: RANKING_QUERY,
				example: {
					path: '/rankings/mania/performance', query: { country: 'FR' },
				},
				response: {
					ranking: [RANKING_ROW], cursor: { page: 2 },
				},
				format: 'Field ranking: UserStatistics[], each with rank and user. cursor is left out on the last page.',
			},
			{
				id: 'get-skill-ranking',
				title: 'Get Skill Ranking',
				path: '/rankings/{mode}/skill/{skill}',
				scope: 'public',
				about: 'Gets the players ranked on one skill, or overall.',
				url: [MODE_PARAM, {
					name: 'skill', type: 'string', about: `${rulesetDef().skills.join(', ')} or overall.`,
				}],
				query: RANKING_QUERY,
				example: { path: '/rankings/mania/skill/stamina' },
				response: {
					ranking: [{
						...RANKING_ROW,
						skill: {
							level: 101, prestige: 2,
						},
					}],
					cursor: { page: 2 },
				},
				format: 'As Get Ranking, each row with skill: { level, prestige }.',
			},
			{
				id: 'get-country-ranking',
				title: 'Get Country Ranking',
				path: '/rankings/{mode}/country',
				scope: 'public',
				about: 'Gets the countries ranked on their players\' summed pp.',
				url: [MODE_PARAM],
				query: [RANKING_QUERY[1]],
				example: { path: '/rankings/mania/country' },
				response: {
					ranking: [{
						rank: 1, code: 'FR', active_users: 65, play_count: 173602, ranked_score: 13185865659, performance: 199753.436,
					}],
				},
				format: 'Field ranking, each row a country.',
			},
		],
	},
	{
		id: 'users',
		title: 'Users',
		endpoints: [
			{
				id: 'get-own-data',
				title: 'Get Own Data',
				path: '/me/{mode?}',
				scope: 'identify',
				user: true,
				about: 'Similar to Get User but with authenticated user (token owner) as user id.',
				url: [OPTIONAL_MODE],
				example: { path: '/me' },
				response: USER,
				format: 'See Get User.',
			},
			{
				id: 'get-friends',
				title: 'Get Friends',
				path: '/friends',
				scope: 'friends.read',
				user: true,
				about: 'Returns the players the token owner added as friends.',
				example: { path: '/friends' },
				response: [{
					...USER_COMPACT, is_online: false, is_mutual: true,
				}],
				format: 'UserCompact[], each with is_online and is_mutual.',
			},
			{
				id: 'get-user-scores',
				title: 'Get User Scores',
				path: '/users/{user}/scores/{type}',
				scope: 'public',
				about: 'Returns the scores of the character the user plays as now. Each score carries its beatmap and beatmapset.',
				url: [USER_PARAM, SCORE_TYPE],
				query: LIST_QUERY,
				example: {
					path: '/users/1375479/scores/best', query: { limit: '5' },
				},
				response: [{
					...SCORE, beatmap: BEATMAP, beatmapset: BEATMAPSET,
				}],
				format: 'Score[].',
			},
			{
				id: 'get-user',
				title: 'Get User',
				path: '/users/{user}/{mode?}',
				scope: 'public',
				about: 'Returns the detail of a user, through the character they play as now.',
				url: [USER_PARAM, OPTIONAL_MODE],
				example: { path: '/users/1375479' },
				response: USER,
				format: 'User.',
			},
			{
				id: 'get-character',
				title: 'Get Character',
				path: '/characters/{character}/{mode?}',
				scope: 'public',
				about: 'The same User, for one character.',
				url: [CHARACTER_PARAM, OPTIONAL_MODE],
				example: { path: '/characters/13' },
				format: 'See Get User.',
			},
			{
				id: 'get-characters',
				title: 'Get Characters',
				path: '/characters',
				scope: 'public',
				about: 'Returns up to 10 characters in one request, as User objects. Unknown or hidden ids are left out.',
				query: [{
					name: 'ids[]', type: 'integer[]', about: 'Ids of the characters, up to 10. More is refused with 400.',
				}],
				example: {
					path: '/characters', query: { 'ids[]': '13' },
				},
				response: { characters: [USER] },
				format: 'Field characters, User[], in no particular order.',
			},
			{
				id: 'get-character-scores',
				title: 'Get Character Scores',
				path: '/characters/{character}/scores/{type}',
				scope: 'public',
				about: 'The same scores as Get User Scores, for one character.',
				url: [CHARACTER_PARAM, SCORE_TYPE],
				query: LIST_QUERY,
				example: { path: '/characters/13/scores/firsts' },
				format: 'See Get User Scores.',
			},
			{
				id: 'get-character-playing',
				title: 'Get Character Playing',
				path: '/characters/{character}/playing',
				scope: 'public',
				about: 'The play the character has in flight: what is being played, when it ends, and the warm-up the gameplay HUD is drawing. Answers while the play is live, null the rest of the time.',
				url: [CHARACTER_PARAM],
				example: { path: '/characters/13/playing' },
				response: { playing: LIVE_PLAY },
				format: 'Field playing: a LivePlay, or null.',
			},
		],
	},
];

const JUDGEMENTS = 'divine, marvelous, perfect, great, good, bad, miss';

export const OBJECTS: ObjectDoc[] = [
	{
		id: 'beatmap',
		title: 'Beatmap',
		about: 'Represent a ranked difficulty.',
		fields: [
			['id', 'integer', ''],
			['osu_id', 'integer?', 'The difficulty\'s id on osu!; left out when the map is not on osu!.'],
			['beatmapset_id', 'integer', ''],
			['version', 'string', ''],
			['difficulty_rating', 'float', ''],
			['mode', 'string', 'Always mania.'],
			['status', 'string', 'ranked or loved (a loved map gives no pp).'],
			['cs', 'integer', 'The number of keys.'],
			['bpm', 'integer', ''],
			['total_length', 'integer', 'In seconds.'],
			['count_circles', 'integer', 'Notes.'],
			['count_sliders', 'integer', 'Long notes.'],
			['playcount', 'integer', ''],
			['url', 'string', 'Its page on oss!idle.'],
			['beatmapset', 'Beatmapset', 'On Get Beatmap and Lookup Beatmap.'],
		],
	},
	{
		id: 'beatmapset',
		title: 'Beatmapset',
		about: 'Represent a beatmapset.',
		fields: [
			['id', 'integer', ''],
			['osu_id', 'integer?', 'The set\'s id on osu!; left out when the map is not on osu!.'],
			['artist', 'string', ''],
			['title', 'string', ''],
			['creator', 'string', ''],
			['status', 'string', 'ranked or loved (a loved map gives no pp).'],
			['ranked_date', 'Timestamp', ''],
			['submitted_date', 'Timestamp', ''],
			['covers', 'object', 'cover: the cover image.'],
			['url', 'string', 'Its page on oss!idle.'],
			['beatmaps', 'Beatmap[]', 'On Get Beatmapset.'],
		],
	},
	{
		id: 'live-play',
		title: 'LivePlay',
		about: 'A play in flight. Reported until the map would end, so a fail is not readable'
			+ ' from it before the player\'s own client has it.',
		fields: [
			['beatmap_id', 'integer', 'The difficulty being played.'],
			['ruleset', 'string', 'The ruleset it plays and scores in.'],
			['rate', 'float', 'The speed it is being played at.'],
			['mods', 'string[]', 'The mods it is being played with.'],
			['ranked', 'boolean', 'False for a match round or an unranked map\'s own leaderboard: no score, no xp.'],
			['started_at', 'Timestamp', 'When the play started, a two-second lead-in included.'],
			['ends_at', 'Timestamp', 'When the map ends.'],
			['server_now', 'Timestamp', 'The server\'s clock as it answered, so progress through the map needs no clock of your own.'],
			['fatigue', 'float', '0 rested to 1 exhausted, as this play is being simulated.'],
			['warmup', 'float', '0 cold to 1 warm.'],
			['warmup_bar', 'float?', 'Where the warm-up bar\'s needle sits, 0 to 1.'],
			['warmup_trend', 'integer?', 'Which way this map is moving it: 3 warming to -3 cooling.'],
		],
	},
	{
		id: 'match-event',
		title: 'MatchEvent',
		about: 'Something that happened in a match.',
		fields: [
			['id', 'integer', ''],
			['type', 'string', MATCH_EVENT.join(', ')],
			['timestamp', 'Timestamp', ''],
			['character_id', 'integer?', 'Who it was about.'],
			['game', 'object?', 'On game events: beatmap_id, start_time, end_time and scores, each with character_id, score, accuracy, max_combo, rank, passed and statistics.'],
		],
	},
	{
		id: 'news-post',
		title: 'NewsPost',
		about: 'A news post.',
		fields: [
			['id', 'integer', ''],
			['slug', 'string', ''],
			['title', 'string', ''],
			['author', 'string', ''],
			['tag', 'string', 'release, update, community, event or dev-blog.'],
			['preview', 'string', 'A summary of the post.'],
			['first_image', 'string?', 'The cover image.'],
			['published_at', 'Timestamp', ''],
			['updated_at', 'Timestamp', ''],
			['url', 'string', ''],
			['content', 'string', 'The post as HTML, on Get News Post.'],
		],
	},
	{
		id: 'score',
		title: 'Score',
		about: 'A play.',
		fields: [
			['id', 'integer', ''],
			['character_id', 'integer', 'The character who played it.'],
			['beatmap_id', 'integer', ''],
			['score', 'integer', ''],
			['accuracy', 'float', '1 is 100%; divine judgements can take it past 1.'],
			['max_combo', 'integer', ''],
			['rank', 'string', 'XX, X, SS, S, A, B, C, D or F.'],
			['pp', 'float', ''],
			['perfect', 'boolean', 'Full combo.'],
			['rate', 'float', 'The playback rate, 0.5 to 1.5.'],
			['mods', 'string[]', 'The mods it was played with: EZ, HR, SD or PF.'],
			['statistics', 'object', `Judgement counts: ${JUDGEMENTS}.`],
			['ended_at', 'Timestamp', ''],
			['beatmap', 'Beatmap', 'On user scores.'],
			['beatmapset', 'Beatmapset', 'On user scores.'],
			['user', 'UserCompact', 'On beatmap scores.'],
		],
	},
	{
		id: 'user',
		title: 'User',
		about: 'A UserCompact with the details below. A user is an account: it plays as one character at a time, and its statistics are that character\'s.',
		fields: [
			['cover_url', 'string?', 'The profile banner.'],
			['title', 'string?', 'The id of the medal worn as a title.'],
			['generation', 'integer', 'How many times the account was reborn, plus one.'],
			['is_supporter', 'boolean', ''],
			['support_level', 'integer', '0 to 3: the hearts on the profile.'],
			['join_date', 'Timestamp', ''],
			['statistics', 'UserStatistics', ''],
			['fatigue', 'object', 'The session the character is in: minutes, the strained minutes it has'
				+ ' accumulated as of this response; level, 0 rested to 1 exhausted; and at, when the'
				+ ' last play that moved it ended.'],
			['warmup', 'object', 'level, 0 cold to 1 warm, and bar, where the warm-up bar\'s needle'
				+ ' sits, 0 to 1. Both are a function of the fatigue minutes and the character\'s'
				+ ' stamina upgrades.'],
			['skills', 'object', 'Each skill with its level, progress, total_xp, prestige and upgrades.'
				+ ' The level shown in game is level + progress / 100 + prestige; total_xp counts'
				+ ' from the last prestige.'],
			['rank_history', 'object', 'mode, and data: the global rank of each of the last 90 days.'],
		],
	},
	{
		id: 'user-compact',
		title: 'UserCompact',
		about: 'Mainly used for embedding in certain responses to save additional api lookups.',
		fields: [
			['id', 'integer', 'The account: its osu! user id.'],
			['character_id', 'integer', 'The character it plays as.'],
			['username', 'string', 'The character\'s name.'],
			['country_code', 'string', 'Two-letter code.'],
			['avatar_url', 'string', ''],
			['profile_url', 'string', ''],
		],
	},
	{
		id: 'user-statistics',
		title: 'UserStatistics',
		about: 'A character\'s statistics.',
		fields: [
			['pp', 'float', ''],
			['global_rank', 'integer?', ''],
			['country_rank', 'integer?', ''],
			['ranked_score', 'integer', ''],
			['total_score', 'integer', ''],
			['play_count', 'integer', ''],
			['play_time', 'integer', 'In seconds.'],
			['total_hits', 'integer', ''],
			['level', 'object',
				'current: the overall level. progress: how far into the next one, in percent (0 to 99).'
				+ ' total_xp: every xp the level and its progress stand for.'],
			['grade_counts', 'object', 'xx, x, ss, s and a.'],
			['statistics', 'object', `Judgement counts over the best scores: ${JUDGEMENTS}.`],
		],
	},
];

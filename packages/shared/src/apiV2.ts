import type {
	GoodGrades,
	Grade,
} from './grade.js';
import type { Mod } from './mods.js';
import type { MatchEvent } from './multiplayer.js';
import type {
	OsuMode,
	RulesetId,
} from './rulesets/ids.js';

/** API v2's objects, as the server writes them (api/objects.ts), and the add-on host's
 *  `api`. packages/api-types bundles this file into @oss-idle/api-types, which the add-on
 *  SDK re-exports: keep its imports type-only. */

export type {
	Grade,
	Mod,
	MatchEvent,
	OsuMode,
	RulesetId,
};

/** A play's or a player's count per judgement, lower-cased (`perfect`, `great`, … `miss`). */
export type ApiStatistics = Record<string, number>;

export type ApiUserCompact = {
	id: number,
	character_id: number,
	username: string,
	country_code: string,
	avatar_url: string,
	profile_url: string,
};

export type ApiLevel = { current: number, progress: number, total_xp: string };

export type ApiUserStatistics = {
	pp: number,
	global_rank?: number,
	country_rank?: number,
	ranked_score: number,
	total_score: number,
	play_count: number,
	play_time: number,
	total_hits: number,
	level: ApiLevel,
	grade_counts: Record<Lowercase<typeof GoodGrades[number]>, number>,
	statistics: ApiStatistics,
};

export type ApiSkill = {
	level: number,
	progress: number,
	/** the level all the XP it ever earned buys: `level` without prestige's bonus levels */
	lifetime_level: number,
	/** the level the skill holds now, which upgrades spend and a prestige resets */
	xp_level: number,
	/** the XP it holds into that level */
	xp: string,
	total_xp: string,
	prestige: number,
	upgrades: number,
	overdrive: string,
	/** what buying the next upgrade now would add to overdrive; absent while it can't be bought */
	upgrade_overdrive?: string,
	/** the climaxx it has to spend on genes; absent in a ruleset without genetics */
	climaxx?: string,
	/** what its XP gains are multiplied by: its upgrades with overdrive's boost, its prestiges,
	 *  the genetics (absent without them) and the character's medals, the same on every skill.
	 *  `total` is their product; a play's own modifiers (mods, fatigue, a map replayed) come on top */
	xp_multipliers: {
		upgrades: string,
		prestige: string,
		genetics?: string,
		medals: string,
		total: string,
	},
};

export type ApiFatigue = { minutes: number, level: number, at?: string };

export type ApiWarmup = { level: number, bar: number };

/** A play in flight, as `GET /characters/{character}/playing` serves it. */
export type ApiLivePlay = {
	beatmap_id: number,
	ruleset: RulesetId,
	rate: number,
	mods: Mod[],
	ranked: boolean,
	started_at: string,
	ends_at: string,
	server_now: string,
	fatigue: number,
	warmup: number,
	warmup_bar?: number,
	warmup_trend?: number,
};

export type ApiUser = ApiUserCompact & {
	cover_url?: string,
	title?: string,
	generation: number,
	is_supporter: boolean,
	support_level: number,
	/** the linked Twitch account's id; on `/me` only */
	twitch_id?: string,
	join_date?: string,
	statistics: ApiUserStatistics,
	/** the strained-minute accumulator, rested to the response, and how tired it leaves the character */
	fatigue: ApiFatigue,
	/** the warm-up that fatigue drives, and where it sits on the warm-up bar (0 to 1) */
	warmup: ApiWarmup,
	skills: Record<string, ApiSkill>,
	rank_history: { mode: string, variant?: string, data: number[] },
};

export type ApiScore = {
	id: number,
	character_id: number,
	beatmap_id: number,
	score: number,
	accuracy: number,
	max_combo: number,
	rank: Grade,
	pp: number | undefined,
	perfect: boolean,
	rate: number,
	mods: Mod[],
	statistics: ApiStatistics,
	ended_at: string,
};

export type ApiBeatmapStatus = 'ranked' | 'loved';

export type ApiBeatmap = {
	id: number,
	osu_id?: number,
	beatmapset_id: number,
	version: string,
	difficulty_rating: number,
	mode?: OsuMode,
	status: ApiBeatmapStatus,
	cs: number,
	bpm: number,
	total_length: number,
	count_circles: number,
	count_sliders: number,
	playcount: number,
	url: string,
};

export type ApiBeatmapset = {
	id: number,
	osu_id?: number,
	artist: string,
	title: string,
	creator: string,
	status: ApiBeatmapStatus,
	ranked_date?: string,
	submitted_date?: string,
	favourite_count: number,
	covers: { cover?: string },
	url: string,
	beatmaps?: ApiBeatmap[],
};

export type ApiNewsPost = {
	id: number,
	slug: string,
	title: string,
	author: string,
	tag: string,
	preview: string,
	first_image?: string,
	published_at?: string,
	updated_at?: string,
	url: string,
	content?: string,
};

/** A character's score, with its map. */
export type ApiScoreOnMap = ApiScore & { beatmap: ApiBeatmap, beatmapset: ApiBeatmapset };

/** osu!'s BeatmapPlaycount: how often the character played a difficulty. */
export type ApiBeatmapPlaycount = {
	beatmap_id: number,
	count: number,
	beatmap: ApiBeatmap,
	beatmapset: ApiBeatmapset,
};

/** A map's leaderboard entry. */
export type ApiBoardScore = ApiScore & { user: ApiUserCompact };

export type ApiBeatmapInSet = ApiBeatmap & { beatmapset: ApiBeatmapset };

export type ApiFriend = ApiUserCompact & { is_online: boolean, is_mutual: boolean };

export type ApiScoreType = 'best' | 'firsts' | 'recent';

export type ApiRankingType = 'performance' | 'score' | 'medals';

/** A ranking page; `cursor` is there while another page follows. */
export type ApiRanking<T> = { ranking: T[], cursor?: { page: number } };

export type ApiUserRanking = ApiUserStatistics & {
	rank: number,
	user: ApiUserCompact,
	/** on the medals ranking */
	medals?: number,
};

export type ApiSkillRanking = ApiUserRanking & { skill: { level: number, prestige?: number } };

export type ApiCountryRanking = {
	rank: number,
	code: string,
	active_users: number,
	play_count: number,
	ranked_score: number,
	performance: number,
};

export type ApiMatch = {
	match: { id: number, name: string, start_time: string, end_time?: string },
	events: {
		id: number,
		type: MatchEvent,
		timestamp: string,
		character_id?: number,
		game?: {
			beatmap_id: number,
			start_time: string,
			end_time?: string,
			scores: {
				character_id?: number,
				score: number,
				accuracy: number,
				max_combo: number,
				rank: Grade,
				passed: boolean,
				statistics: ApiStatistics,
			}[],
		},
	}[],
	users: { character_id: number, username: string, country_code: string }[],
};

/** A skill's state for `simulate`; what is left out counts as 0. */
export type ApiSkillState = {
	level: number,
	xp?: number | string,
	lifetime_xp?: number | string,
	prestige?: number,
	upgrades?: number,
	overdrive?: number | string,
};

/** `POST /api/v2/simulate`'s body: a 4K character state and a live map. */
export type ApiSimulateRequest = {
	beatmap_id: number,
	rate?: number,
	mods?: Mod[],
	generation?: number,
	strain_minutes?: number,
	map_plays?: number,
	skills?: Partial<Record<string, ApiSkillState>>,
};

/** The play a character in that state would make, and each skill's xp. */
export type ApiSimulation = {
	beatmap_id: number,
	rate: number,
	mods: Mod[],
	score: number,
	accuracy: number,
	max_combo: number,
	rank: Grade,
	pp: number,
	perfect: boolean,
	passed: boolean,
	statistics: ApiStatistics,
	unstable_rate: number,
	/** minutes of the play its physical skills strained for: what tires and warms the character */
	strained_minutes: number,
	fail_progress?: number,
	fail_seconds?: number,
	xp: Record<string, string>,
};

/** How an `AddonApi` call fails: the server's message, and the HTTP status. */
export type ApiError = Error & { status: number };

/** The ruleset asked about; the player's pick when left out. */
export type RulesetOption = { ruleset?: RulesetId };
export type PageOption = { limit?: number, offset?: number };
export type ListOption = RulesetOption & PageOption;
/** an account id, or a current character's name */
export type UserRef = number | string;
export type RankingOption = RulesetOption & { country?: string, page?: number };

/**
 * API v2 (the docs at /web/docs) as the signed-in player: their session stands for a
 * token with every scope. A guest has none, so every call fails with a 401 {@link ApiError}.
 */
export type AddonApi = {
	me(options?: RulesetOption): Promise<ApiUser>,
	friends(): Promise<ApiFriend[]>,
	/** the play a 4K character in this state would make on a live map */
	simulate(body: ApiSimulateRequest): Promise<ApiSimulation>,
	user(user: UserRef, options?: RulesetOption): Promise<ApiUser>,
	userScores(user: UserRef, type: ApiScoreType, options?: ListOption): Promise<ApiScoreOnMap[]>,
	/** the difficulties it played most, most first */
	userMostPlayed(user: UserRef, options?: ListOption): Promise<ApiBeatmapPlaycount[]>,
	characters(ids: number[], options?: RulesetOption): Promise<ApiUser[]>,
	character(id: number, options?: RulesetOption): Promise<ApiUser>,
	characterScores(id: number, type: ApiScoreType, options?: ListOption): Promise<ApiScoreOnMap[]>,
	beatmap(id: number): Promise<ApiBeatmapInSet>,
	/** by the osu! id of the difficulty */
	beatmapLookup(osuId: number): Promise<ApiBeatmapInSet>,
	beatmapScores(id: number, options?: { country?: string }): Promise<ApiBoardScore[]>,
	beatmapset(id: number, options?: RulesetOption): Promise<ApiBeatmapset>,
	rankings(type: ApiRankingType, options?: RankingOption): Promise<ApiRanking<ApiUserRanking>>,
	/** `overall` or a skill's name */
	skillRankings(skill: string, options?: RankingOption): Promise<ApiRanking<ApiSkillRanking>>,
	countryRankings(
		options?: RulesetOption & { page?: number },
	): Promise<ApiRanking<ApiCountryRanking>>,
	match(id: number): Promise<ApiMatch>,
	news(options?: PageOption): Promise<ApiNewsPost[]>,
	newsPost(slug: string): Promise<ApiNewsPost>,
};

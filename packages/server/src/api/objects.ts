import type {
	ApiBeatmap,
	ApiBeatmapset,
	ApiNewsPost,
	ApiScore,
	ApiStatistics,
	ApiUser,
	ApiUserCompact,
	ApiUserStatistics,
} from '@oss-idle/shared/apiV2';
import { mapCoverUrl } from '@oss-idle/shared/beatmap';
import { GoodGrades } from '@oss-idle/shared/grade';
import {
	OSU_MODE,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';
import type { ScoreDTO } from '@oss-idle/shared/score';
import { supportLevel } from '@oss-idle/shared/supporter';
import {
	playLevelOf,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import type { BeatmapRow } from '../db/schema/beatmap';
import type { RulesetSetRow } from '../db/schema/beatmapset';
import {
	type CharacterRow,
	type ProfileRow,
	resolveAvatarUrl,
	resolveBannerUrl,
	skillOf,
} from '../db/schema/character';
import type { CharacterTotalsRow } from '../db/schema/character_totals';
import type { NewsRow } from '../db/schema/news';
import {
	supporterActive,
	type UserRow,
} from '../db/schema/user';
import {
	apiBaseUrl,
	clientUrl,
} from '../env';
import { levelPercent } from './levelPercent';

/** osu!'s API objects, in its snake_case, with the fields we have. */

const lower = <K extends string>(k: K) => k.toLowerCase() as Lowercase<K>;

/** A play's or a player's count per judgement, by the ruleset's judgements. */
export const statistics = (
	def: RulesetDef,
	counts: Readonly<Record<string, number>>,
): ApiStatistics =>
	Object.fromEntries(def.judgements.map(j => [lower(j), counts[j]]));

const iso = (d: Date | null | undefined) => d?.toISOString();

/** `avatarUrl` already resolved (resolveAvatarUrl). */
type UserCompactInput = {
	userId: number;
	characterId: number;
	name: string;
	country: string;
	avatarUrl: string;
};

export const userCompact = (u: UserCompactInput): ApiUserCompact => ({
	id: u.userId,
	character_id: u.characterId,
	username: u.name,
	country_code: u.country,
	avatar_url: u.avatarUrl,
	profile_url: `${clientUrl}/web/c/${u.characterId}`,
});

const gradeCounts = (totals: CharacterTotalsRow) =>
	Object.fromEntries(GoodGrades.map(g => [lower(g), totals[g]])) as
		Record<Lowercase<typeof GoodGrades[number]>, number>;

/** osu!'s level object for every xp ever earned. */
const levelOfXp = (totalXp: number) => {
	const { level, xp } = xpGivesLevel(totalXp);
	return {
		current: level,
		progress: levelPercent(level, xp),
		total_xp: totalXp,
	};
};

export const userStatistics = (
	def: RulesetDef,
	profile: Pick<ProfileRow, 'pp' | 'overallLifetimeXp'>,
	totals: CharacterTotalsRow,
	ranks: { global?: number; country?: number },
): ApiUserStatistics => ({
	pp: Number(profile.pp),
	global_rank: ranks.global,
	country_rank: ranks.country,
	ranked_score: totals.rankedScore,
	total_score: totals.totalScore,
	play_count: totals.playCount,
	play_time: totals.playTime,
	total_hits: totals.hits,
	level: levelOfXp(profile.overallLifetimeXp),
	grade_counts: gradeCounts(totals),
	statistics: statistics(def, totals as unknown as Record<string, number>),
});

export const apiUser = (
	def: RulesetDef,
	user: UserRow,
	character: CharacterRow,
	profile: ProfileRow,
	totals: CharacterTotalsRow,
	ranks: { global?: number; country?: number },
): ApiUser => {
	const { mode, variant }: { mode: string, variant?: string } = RULESETS[def.id];
	const supporter = supporterActive(user);
	return {
		...userCompact({
			userId: user.id,
			characterId: character.id,
			name: character.name,
			country: user.country,
			avatarUrl: resolveAvatarUrl(character.avatarUrl, user.avatarUrl),
		}),
		cover_url: resolveBannerUrl(character.bannerUrl),
		title: character.title ?? undefined,
		generation: profile.generation,
		is_supporter: supporter,
		support_level: supportLevel(supporter, user.supporterMonths),
		join_date: iso(user.createdAt),
		statistics: userStatistics(def, profile, totals, ranks),
		skills: Object.fromEntries(def.skills.map(s => {
			const skill = skillOf(profile, s);
			const shown = playLevelOf(skill.level, skill.xp, skill.lifetimeXp, skill.prestige);
			return [s, {
				level: Math.floor(shown),
				progress: Math.min(99, Math.floor((shown % 1) * 100)),
				total_xp: skill.lifetimeXp,
				prestige: skill.prestige,
				upgrades: skill.upgrades,
			}];
		})),
		rank_history: {
			mode, variant, data: profile.rankHistory?.ranks ?? [],
		},
	};
};

export const apiScore = (def: RulesetDef, score: ScoreDTO): ApiScore => ({
	id: score.id,
	character_id: score.characterId,
	beatmap_id: score.beatmapId,
	score: score.score,
	accuracy: score.accuracy,
	max_combo: score.maxCombo,
	rank: score.grade,
	pp: score.pp,
	perfect: score.pfc,
	rate: score.rate,
	mods: score.mods,
	statistics: statistics(def, score.judgements),
	ended_at: new Date(score.playedAt).toISOString(),
});

type BeatmapInput = Omit<BeatmapRow, 'chart'>;

/** osu!'s status for an approved set: ranked or loved. */
const apiStatus = (s: Pick<RulesetSetRow, 'status'>) => s.status === 'loved' ? 'loved' : 'ranked';

export const apiBeatmap = (b: BeatmapInput, set: Pick<RulesetSetRow, 'status'>): ApiBeatmap => ({
	id: b.id,
	osu_id: b.osuId ?? undefined,
	beatmapset_id: b.setId,
	version: b.version,
	difficulty_rating: Number(b.sr),
	mode: (Object.keys(OSU_MODE) as (keyof typeof OSU_MODE)[]).find(m => OSU_MODE[m] === b.mode),
	status: apiStatus(set),
	cs: b.keys,
	bpm: b.bpm,
	total_length: Math.round(b.total_length / 1000),
	count_circles: b.rice,
	count_sliders: b.ln,
	playcount: b.plays,
	url: `${clientUrl}/web/maps/${b.setId}?diff=${b.id}`,
});

export const apiBeatmapset = (s: RulesetSetRow, beatmaps: BeatmapInput[] = []): ApiBeatmapset => ({
	id: s.id,
	osu_id: s.osuId ?? undefined,
	artist: s.artist,
	title: s.title,
	creator: s.creator,
	status: apiStatus(s),
	ranked_date: iso(s.rankedAt),
	submitted_date: iso(s.submittedAt),
	covers: {
		cover: mapCoverUrl({
			...s, background: beatmaps.find(b => b.background)?.background,
		}, 'cover', apiBaseUrl), 
	},
	url: `${clientUrl}/web/maps/${s.id}`,
	...beatmaps.length && { beatmaps: beatmaps.map(b => apiBeatmap(b, s)) },
});

const absolute = (url: string) => /^https?:/.test(url) ? url : `${apiBaseUrl}${url}`;

export const apiNewsPost = (row: NewsRow, author: string, withContent = false): ApiNewsPost => ({
	id: row.id,
	slug: row.slug,
	title: row.title,
	author,
	tag: row.tag,
	preview: row.summary,
	first_image: row.imageUrl ? absolute(row.imageUrl) : undefined,
	published_at: iso(row.publishedAt),
	updated_at: iso(row.updatedAt),
	url: `${clientUrl}/web/news/${row.slug}`,
	...withContent && { content: row.content },
});

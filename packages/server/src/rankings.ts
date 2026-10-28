import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	ne,
} from 'drizzle-orm';

import { medalWeight } from '@oss-idle/shared/achievements/catalogue';
import {
	type GoodGrade,
	GoodGrades,
} from '@oss-idle/shared/grade';
import { MAKISEBOT_ID } from '@oss-idle/shared/groups';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import { rankValue } from '@oss-idle/shared/scoreOrder';
import { playLevelOf } from '@oss-idle/shared/xp';

import { db } from './db/client';
import {
	characters,
	profileDTO,
	type ProfileRow,
	RANK_HISTORY_DAYS,
	type RankBoard,
	type RankHistory,
	skillOf,
} from './db/schema/character';
import { getMedals } from './db/schema/character_medal';
import { users } from './db/schema/user';
import { redisKeyPrefix } from './env';
import { recordProgress } from './medals';
import { redis } from './redis';
import { enabledRulesets } from './rulesets/registry';
import type { ServerRuleset } from './rulesets/ruleset';

/**
 * Player rankings, kept in Redis sorted sets instead of recomputed on every
 * fetch. MySQL stays the source of truth; these sets are a derived index that
 * answers the two hot questions in O(log N):
 *
 *  - rank of one character    -> ZREVRANK   (the profile page: global/country/
 *                                            score/overall + best-skill rank)
 *  - a leaderboard page       -> ZREVRANGE  (the ranking listings)
 *
 * One member per character per set, scored by the metric. A score change is a
 * single ZADD - no row-by-row rank rewrites, and because the set lives in the
 * cluster's shared Redis every worker sees the update at once (an in-process
 * cache could not). Sorted-set scores are float64: exact for integers below
 * 2^53, far above any realistic xp/score.
 */

// Skills/overall are scored by *total* xp: it rises monotonically with level
// then xp, so it orders identically to (level, xp) without packing two numbers.
/** Boards built on a skill: what it holds now, what it has ever earned, and how
 *  many times it has been prestiged. `overall`/`total` are the summed columns. */
type LifetimeMetric = `lifetime:${string}`;
type PrestigeMetric = `prestige:${string}`;
// a skill board is named after the ruleset's skill
type GlobalMetric = 'pp' | 'score' | 'overall' | GoodGrade | 'allgrades'
	| LifetimeMetric | PrestigeMetric | 'medals' | (string & {});
type CountryMetric = GlobalMetric;

// Every ruleset has its own boards: nothing ranks across rulesets.
const ROOT = `${redisKeyPrefix}ranking:`;
// Meta keys live outside PREFIX so the rebuild's `${PREFIX}*` wipe can't delete
// the build lock out from under itself (which would let a second worker rebuild
// in parallel).
const META = `${redisKeyPrefix}rankmeta:`;
// Bump when the set layout changes so the next deploy rebuilds from MySQL.
const SCHEMA = 14;  // skill boards on the shown level, overall on lifetime xp
const builtKey = (r: ServerRuleset) => `${META}built:v${SCHEMA}:${r.def.id}`;
const lockKey = (r: ServerRuleset) => `${META}lock:v${SCHEMA}:${r.def.id}`;

const suffix = (country?: string) => country === undefined ? '' : `:c:${country || '__'}`;

/** A ruleset's board keys. */
const keysOf = (r: ServerRuleset) => {
	const PREFIX = `${ROOT}${r.def.id}:`;
	return {
		PREFIX,
		globalKey: (m: GlobalMetric) => `${PREFIX}${m}`,
		countryKey: (m: CountryMetric, country: string) => `${PREFIX}${m}${suffix(country)}`,
		// One sorted set per beatmap (and per beatmap+country), scored by best score
		// then accuracy. Score alone is not enough now that divine exists: it is capped
		// at 1M and raises accuracy instead, so every top play would tie on score and
		// the earlier one would keep the place forever.
		beatmapKey: (beatmapId: number, country?: string) => `${PREFIX}bm:${beatmapId}${suffix(country)}`,
		// Reverse index: the score id currently in the set for each character on a
		// beatmap. Lets a re-index ZREM the now-stale member, and a rank query rebuild
		// the member without a DB hit. Wiped/rebuilt with the sets (shares PREFIX).
		beatmapIds: (beatmapId: number) => `${PREFIX}bm:${beatmapId}:ids`,
	};
};

// The sort value comes from shared/scoreOrder, the same rule that decides which
// of two plays is a character's best - they have to agree, so they are one thing.
const beatmapScore = rankValue;

// Equal scores tiebreak on the winning score's id - the earlier (lower id) play
// ranks higher, matching compareScores. The id can't ride in the float64 set
// score (it would lose precision once it's a bigint), so it goes in the member:
// Redis breaks score ties by member, lexicographically. The member is
// `<invertedId>:<characterId>`, the id inverted and zero-padded to a fixed width
// so that under ZREVRANGE (member desc) a lower id sorts first. characterId
// trails it so the member still decodes back to the character.
const ID_WIDTH = 19; // fits a signed 64-bit id (max ~9.2e18)
const ID_MAX = 10n ** BigInt(ID_WIDTH) - 1n;
const beatmapMember = (characterId: number, scoreId: number | bigint) =>
	`${(ID_MAX - BigInt(scoreId)).toString().padStart(ID_WIDTH, '0')}:${characterId}`;
const memberCharacterId = (member: string) => Number(member.slice(member.indexOf(':') + 1));

export { PAGE_SIZE };

/** What `index` writes through: a pipeline, or one that removes instead (`unindexCharacter`). */
type Indexer = { zadd: (key: string, score: number, member: string) => unknown };

/** Add/refresh every set entry for one character in a single pipeline. */
function index(
	r: ServerRuleset,
	pipeline: Indexer,
	data: Awaited<ReturnType<typeof getCharacterFields>>,
	medals: string[],
) {
	if (!data) return;
	const { globalKey, countryKey } = keysOf(r);

	const member = String(data.character.id);
	const weight = medalWeight(r.def.medals, medals);
	pipeline.zadd(globalKey('medals'), weight, member);
	pipeline.zadd(countryKey('medals', data.user.country), weight, member);
	pipeline.zadd(globalKey('pp'), Number(data.profile.pp), member);
	pipeline.zadd(globalKey('score'), data.totals?.rankedScore ?? 0, member);
	pipeline.zadd(globalKey('overall'), data.profile.overallLifetimeXp, member);
	pipeline.zadd(countryKey('pp', data.user.country), Number(data.profile.pp), member);
	pipeline.zadd(
		countryKey('score', data.user.country),
		data.totals?.rankedScore ?? 0,
		member,
	);
	pipeline.zadd(countryKey('overall', data.user.country), data.profile.overallLifetimeXp, member);
	// skill boards rank on the level the listings show, so the page reads in the
	// same order as its own numbers
	let prestiges = 0;
	for (const skill of r.def.skills) {
		const columns = skillOf(data.profile, skill);
		const level = playLevelOf(columns.level, columns.xp, columns.lifetimeXp, columns.prestige);
		pipeline.zadd(globalKey(skill), level, member);
		pipeline.zadd(countryKey(skill, data.user.country), level, member);

		// what the skill has ever earned - spending never takes from this
		const lifetime = columns.lifetimeXp;
		pipeline.zadd(globalKey(`lifetime:${skill}`), lifetime, member);
		pipeline.zadd(countryKey(`lifetime:${skill}`, data.user.country), lifetime, member);

		const prestige = columns.prestige;
		prestiges += prestige;
		pipeline.zadd(globalKey(`prestige:${skill}`), prestige, member);
		pipeline.zadd(countryKey(`prestige:${skill}`, data.user.country), prestige, member);
	}
	// the summed columns: lifetime overall is already the sum of the skills'
	pipeline.zadd(globalKey('lifetime:overall'), data.profile.overallLifetimeXp, member);
	pipeline.zadd(
		countryKey('lifetime:overall', data.user.country),
		data.profile.overallLifetimeXp,
		member,
	);
	pipeline.zadd(globalKey('prestige:total'), prestiges, member);
	pipeline.zadd(countryKey('prestige:total', data.user.country), prestiges, member);
	let allgrades = 0;
	for (const grade of GoodGrades) {
		pipeline.zadd(globalKey(grade), data.totals?.[grade] ?? 0, member);
		pipeline.zadd(countryKey(grade, data.user.country), data.totals?.[grade] ?? 0, member);
		allgrades += data.totals?.[grade] ?? 0;
	}
	pipeline.zadd(globalKey('allgrades'), allgrades, member);
	pipeline.zadd(countryKey('allgrades', data.user.country), allgrades, member);
}

/** A character with its profile and totals in the ruleset, or nothing if it never played it. */
const getCharacterFields = async ({ profile, totals }: ServerRuleset, id: number) => {
	const [row] = await db
		.select({
			character: characters, profile, totals, user: users,
		})
		.from(characters)
		.innerJoin(profile, eq(profile.id, characters.id))
		.leftJoin(totals, eq(totals.id, characters.id))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(eq(characters.id, id))
		.limit(1);
	if (!row) return;
	return row;
};

/** A restricted account is in no ranking and no leaderboard, nor is MakiseBot, like osu!'s BanchoBot. */
const visible = and(isNull(users.restrictedAt), ne(characters.id, MAKISEBOT_ID));

/** Re-index one character after its metrics change. Called once per finalized
 *  play and on character creation. */
export const reindexCharacter = async (r: ServerRuleset, id: number) => {
	const character = await getCharacterFields(r, id);
	if (!character || character.user.restrictedAt || id === MAKISEBOT_ID) return;
	await recordProgress(r, id);
	const pipeline = redis.pipeline();
	index(r, pipeline, character, (await getMedals(r, id)).map(m => m.medalId));
	await pipeline.exec();
	await refreshTodayRank(r, character.profile, character.user.country);
};

type BoardRanks = Partial<Record<RankBoard, number>>;
type Highest = NonNullable<RankHistory['highest']>;

/** The Redis key behind each profile rank board. */
const boardKeys = (r: ServerRuleset, country: string): [RankBoard, string][] => {
	const { globalKey, countryKey } = keysOf(r);
	return [
		['pp', globalKey('pp')],
		['country', countryKey('pp', country)],
		['score', globalKey('score')],
		['overall', globalKey('overall')],
		...r.def.skills.map((s): [RankBoard, string] => [s, globalKey(s)]),
	];
};

/** `highest` with every board `ranks` beats moved to `at`. */
const withHighest = (highest: Highest = {}, ranks: BoardRanks, at: number): Highest => {
	const next = { ...highest };
	for (const [board, rank] of Object.entries(ranks) as [RankBoard, number | undefined][]) {
		if (rank !== undefined && rank < (next[board]?.rank ?? Infinity)) next[board] = {
			rank, at, 
		};
	}
	return next;
};

/** `highest` with the pp peak of the daily samples, which predate highest-rank
 *  tracking. Sample i is dated like the rank graph: `date` minus its age in days. */
const withHistoryPeak = ({ date, ranks, highest = {} }: RankHistory): Highest => {
	if (!ranks.length) return highest;
	const rank = Math.min(...ranks);
	if (rank >= (highest.pp?.rank ?? Infinity)) return highest;
	const at = Date.parse(date) - (ranks.length - 1 - ranks.indexOf(rank)) * 86_400_000;
	return {
		...highest, pp: {
			rank, at, 
		}, 
	};
};

const ranksOf = async (r: ServerRuleset, id: number, country: string): Promise<BoardRanks> => {
	const keys = boardKeys(r, country);
	const pipeline = redis.pipeline();
	for (const [, key] of keys) pipeline.zrevrank(key, String(id));
	const res = await pipeline.exec();
	return Object.fromEntries(keys.map(([board], i) => {
		const value = res?.[i]?.[1];
		return [board, typeof value === 'number' ? value + 1 : undefined];
	}));
};

/** A pp change moves today's rank: rewrite the current day's history sample
 *  (append it if the daily sweep hasn't reached this character yet), and
 *  record any new highest rank. */
const refreshTodayRank = async (
	r: ServerRuleset,
	row: Pick<ProfileRow, 'id' | 'rankHistory'>,
	country: string,
) => {
	// mid-rebuild the boards are part filled: a rank read there is not one
	if (!await redis.exists(builtKey(r))) return;
	const boards = await ranksOf(r, row.id, country);
	const rank = boards.pp;
	if (rank === undefined) return;
	const today = new Date().toISOString().slice(0, 10);
	const previous = row.rankHistory ?? {
		date: '', ranks: [],
	};
	const ranks = previous.date === today
		? [...previous.ranks.slice(0, -1), rank]
		: [...previous.ranks, rank].slice(-RANK_HISTORY_DAYS);
	await db
		.update(r.profile)
		.set({
			rankHistory: {
				date: today, ranks, highest: withHighest(previous.highest, boards, Date.now()),
			},
		})
		.where(eq(r.profile.id, row.id));
};

/** 1-based rank, or undefined when the character is not in the set. */
const rankIn = async (key: string, id: number): Promise<number | undefined> => {
	const r = await redis.zrevrank(key, String(id));
	return r === null ? undefined : r + 1;
};

export const globalRank = (r: ServerRuleset, m: GlobalMetric, id: number) =>
	rankIn(keysOf(r).globalKey(m), id);

/** The share of players with pp that rank at or above this character, in percent. */
export const ppTopPercent = async (r: ServerRuleset, id: number): Promise<number | undefined> => {
	const key = keysOf(r).globalKey('pp');
	const [rank, players] = await Promise.all([rankIn(key, id), redis.zcount(key, '(0', '+inf')]);
	return rank && players ? 100 * rank / players : undefined;
};

/** {@link globalRank} for many characters in one round trip, in order. */
export const globalRanks = async (
	r: ServerRuleset,
	m: GlobalMetric,
	ids: number[],
): Promise<(number | undefined)[]> => {
	if (!ids.length) return [];
	const { globalKey } = keysOf(r);
	const pipeline = redis.pipeline();
	for (const id of ids) pipeline.zrevrank(globalKey(m), String(id));
	const res = await pipeline.exec();
	return (res ?? []).map(([err, r]) => err || r === null ? undefined : (r as number) + 1);
};
export const countryRank = (
	r: ServerRuleset,
	m: CountryMetric,
	country: string,
	id: number,
) => rankIn(keysOf(r).countryKey(m, country), id);

/** The single skill this character ranks highest in, globally. */
export async function bestSkillRank(r: ServerRuleset, id: number): Promise<{
	skill: string;
	rank: number
} | undefined> {
	const { globalKey } = keysOf(r);
	const pipeline = redis.pipeline();
	for (const s of r.def.skills) pipeline.zrevrank(globalKey(s), String(id));
	const res = await pipeline.exec();

	let best: { skill: string; rank: number } | undefined;
	res?.forEach(([err, value], i) => {
		if (err || value === null) return;
		const rank = (value as number) + 1;
		if (!best || rank < best.rank) best = {
			skill: r.def.skills[i], rank, 
		};
	});
	return best;
}

/** The character ids on a leaderboard page, in rank order. */
const pageIds = async (key: string, page: number): Promise<number[]> => {
	const start = (page - 1) * PAGE_SIZE;
	const ids = await redis.zrevrange(key, start, start + PAGE_SIZE - 1);
	return ids.map(Number);
};

/** Hydrate ranked ids into the joined rows the listings render, in rank order. */
async function hydrate({ def, profile, totals }: ServerRuleset, ids: number[]) {
	if (ids.length === 0) return [];
	const rows = await db
		.select({
			character: characters,
			profile,
			totals,
			// the account row holds private ids (Discord, Stripe): only what the boards show
			user: {
				id: users.id, country: users.country, avatarUrl: users.avatarUrl,
			},
		})
		.from(characters)
		.innerJoin(profile, eq(profile.id, characters.id))
		.innerJoin(totals, eq(totals.id, characters.id))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(inArray(characters.id, ids));
	const byId = new Map(rows.map(r => [r.character.id, {
		...r, profile: profileDTO(r.profile, def),
	}]));
	return ids.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
}

/** A board narrowed to some characters (a player and their friends), ranked
 *  among themselves. Characters not on the board are left out. */
const amongPageIds = async (key: string, page: number, among: number[]): Promise<number[]> => {
	if (!among.length) return [];
	const pipeline = redis.pipeline();
	for (const id of among) pipeline.zscore(key, String(id));
	const res = await pipeline.exec();
	const start = (page - 1) * PAGE_SIZE;
	return among
		.map((id, i) => ({
			id, score: res?.[i]?.[1],
		}))
		.filter(r => r.score !== null && r.score !== undefined)
		.sort((a, b) => Number(b.score) - Number(a.score))
		.slice(start, start + PAGE_SIZE)
		.map(r => r.id);
};

const hydratePage = async (r: ServerRuleset, key: string, page: number, among?: number[]) =>
	hydrate(r, among ? await amongPageIds(key, page, among) : await pageIds(key, page));

/** Countries that have at least one player, with their player count, most
 *  populated first. Cached briefly - the list changes only when a new country's
 *  first player joins, and a few minutes of staleness on a filter list is fine. */
type CountryCount = { country: string; count: number };
const countriesCache = new Map<string, { at: number; rows: CountryCount[] }>();
const COUNTRIES_TTL = 5 * 60 * 1000;

export async function playerCountries(r: ServerRuleset): Promise<CountryCount[]> {
	const cached = countriesCache.get(r.def.id);
	if (cached && Date.now() - cached.at < COUNTRIES_TTL) return cached.rows;
	const rows = await db
		.select({
			country: users.country, count: count(),
		})
		.from(r.profile)
		.innerJoin(characters, eq(characters.id, r.profile.id))
		.innerJoin(users, eq(users.id, characters.userId))
		.groupBy(users.country)
		.orderBy(desc(count()));
	countriesCache.set(r.def.id, {
		at: Date.now(), rows,
	});
	return rows;
}

const metricKey = (
	r: ServerRuleset,
	m: GlobalMetric,
	country?: string,
) => country === undefined ? keysOf(r).globalKey(m) : keysOf(r).countryKey(m, country);

export const skillPage = (
	r: ServerRuleset,
	skill: GlobalMetric,
	page: number,
	country?: string,
	among?: number[],
) => hydratePage(r, metricKey(r, skill, country), page, among);
export const gradesPage = (
	r: ServerRuleset,
	grade: GoodGrade | 'all',
	page: number,
	country?: string,
	among?: number[],
) => hydratePage(r, metricKey(r, grade === 'all' ? 'allgrades' : grade, country), page, among);
export const ppPage = (
	r: ServerRuleset,
	page: number,
	country?: string,
	among?: number[],
) => hydratePage(r, metricKey(r, 'pp', country), page, among);
export const scorePage = (
	r: ServerRuleset,
	page: number,
	country?: string,
	among?: number[],
) => hydratePage(r, metricKey(r, 'score', country), page, among);

const medalCounts = ({ medals }: ServerRuleset, ids: number[]) => db
	.select({
		id: medals.characterId, n: count(),
	})
	.from(medals)
	.where(inArray(medals.characterId, ids))
	.groupBy(medals.characterId);

/** The medal board, each row with its medals held and the board's value. */
export const medalsPage = async (
	r: ServerRuleset,
	page: number,
	country?: string,
	among?: number[],
) => {
	const key = metricKey(r, 'medals', country);
	const rows = await hydratePage(r, key, page, among);
	if (!rows.length) return [];
	const ids = rows.map(r => r.character.id);
	const pipeline = redis.pipeline();
	for (const id of ids) pipeline.zscore(key, String(id));
	const [scores, counts] = await Promise.all([pipeline.exec(), medalCounts(r, ids)]);
	const held = new Map(counts.map(r => [r.id, r.n]));
	return rows.map((row, i) => ({
		...row,
		medals: {
			held: held.get(row.character.id) ?? 0, score: Number(scores?.[i]?.[1] ?? 0),
		},
	}));
};

/** Per-beatmap leaderboard: the character ids with a best on this map, in score
 *  order (global or within one country). The route hydrates the `best` rows. */
export const beatmapPageIds = async (
	r: ServerRuleset,
	beatmapId: number,
	page: number,
	country?: string,
): Promise<number[]> => {
	const start = (page - 1) * PAGE_SIZE;
	const members = await redis.zrevrange(
		keysOf(r).beatmapKey(beatmapId, country), start, start + PAGE_SIZE - 1,
	);
	return members.map(memberCharacterId);
};

export async function beatmapRank(
	r: ServerRuleset,
	beatmapId: number,
	characterId: number,
	country?: string,
): Promise<number | undefined> {
	const { beatmapKey, beatmapIds } = keysOf(r);
	const id = await redis.hget(beatmapIds(beatmapId), String(characterId));
	if (id === null) return undefined;
	const rank = await redis.zrevrank(
		beatmapKey(beatmapId, country),
		beatmapMember(characterId, BigInt(id)),
	);
	return rank === null ? undefined : rank + 1;
}

/** Re-index a character's best on one beatmap after a play improves it. */
export async function reindexBeatmap(
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<void> {
	const { best } = r;
	const { beatmapKey, beatmapIds } = keysOf(r);
	const [row] = await db
		.select({
			id: best.id, score: best.score, accuracy: best.accuracy, country: users.country, 
		})
		.from(best)
		.innerJoin(characters, eq(characters.id, best.characterId))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(and(eq(best.beatmapId, beatmapId), eq(best.characterId, characterId), visible))
		.limit(1);
	if (!row) return;
	const member = beatmapMember(characterId, row.id);
	const prev = await redis.hget(beatmapIds(beatmapId), String(characterId));
	const pipeline = redis.pipeline();
	if (prev !== null && prev !== String(row.id)) {
		const stale = beatmapMember(characterId, BigInt(prev));
		pipeline.zrem(beatmapKey(beatmapId), stale);
		pipeline.zrem(beatmapKey(beatmapId, row.country), stale);
	}
	const value = beatmapScore(row.score, row.accuracy);
	pipeline.zadd(beatmapKey(beatmapId), value, member);
	pipeline.zadd(beatmapKey(beatmapId, row.country), value, member);
	pipeline.hset(beatmapIds(beatmapId), String(characterId), String(row.id));
	await pipeline.exec();
}

/** Take a character off every ranking and every beatmap leaderboard (a restriction). */
export const unindexCharacter = async (id: number): Promise<void> => {
	for (const r of enabledRulesets()) await unindexCharacterIn(r, id);
};

const unindexCharacterIn = async (r: ServerRuleset, id: number): Promise<void> => {
	const { best } = r;
	const { beatmapKey, beatmapIds } = keysOf(r);
	const character = await getCharacterFields(r, id);
	if (!character) return;
	const pipeline = redis.pipeline();
	index(r, { zadd: (key, _score, member) => pipeline.zrem(key, member) }, character, []);
	const bests = await db
		.select({
			id: best.id, beatmapId: best.beatmapId,
		})
		.from(best)
		.where(eq(best.characterId, id));
	for (const b of bests) {
		const member = beatmapMember(id, b.id);
		pipeline.zrem(beatmapKey(b.beatmapId), member);
		pipeline.zrem(beatmapKey(b.beatmapId, character.user.country), member);
		pipeline.hdel(beatmapIds(b.beatmapId), String(id));
	}
	await pipeline.exec();
};

/** Put a character back on every board (a restriction lifted). */
export const reindexCharacterEverywhere = async (id: number): Promise<void> => {
	for (const r of enabledRulesets()) {
		await reindexCharacter(r, id);
		const bests = await db
			.select({ beatmapId: r.best.beatmapId })
			.from(r.best)
			.where(eq(r.best.characterId, id));
		for (const b of bests) await reindexBeatmap(r, id, b.beatmapId);
	}
};

/** Drop a beatmap's leaderboard sets (global, per-country and the reverse
 *  index). For unranking: the map's scores are gone, so the index must go too. */
export async function unindexBeatmap(r: ServerRuleset, beatmapId: number): Promise<void> {
	const { PREFIX, beatmapKey } = keysOf(r);
	await redis.del(beatmapKey(beatmapId));
	for await (const key of scanKeys(`${PREFIX}bm:${beatmapId}:*`)) await redis.del(key);
}

/** Rebuild every set of a ruleset from MySQL. One DB pass, pipelined in chunks. */
export async function rebuildAll(r: ServerRuleset): Promise<void> {
	const {
		profile, totals, medals, best,
	} = r;
	const { PREFIX, beatmapKey, beatmapIds } = keysOf(r);
	for await (const key of scanKeys(`${PREFIX}*`)) await redis.del(key);

	const rows = await db
		.select({
			character: characters, profile, totals, user: users,
		})
		.from(characters)
		.innerJoin(profile, eq(profile.id, characters.id))
		.leftJoin(totals, eq(totals.id, characters.id))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(visible)
		.orderBy(desc(profile.pp));
	const held = new Map<number, string[]>();
	for (const m of await db.select().from(medals)) {
		held.set(m.characterId, [...held.get(m.characterId) ?? [], m.medalId]);
	}

	for (const row of rows) await recordProgress(r, row.character.id);

	let pipeline = redis.pipeline();
	for (let i = 0; i < rows.length; i++) {
		index(r, pipeline, rows[i], held.get(rows[i].character.id) ?? []);
		if (i % 200 === 199) {
			await pipeline.exec();
			pipeline = redis.pipeline();
		}
	}
	await pipeline.exec();

	const bests = await db
		.select({
			id: best.id, beatmapId: best.beatmapId, characterId: best.characterId, score: best.score,
			accuracy: best.accuracy, country: users.country, 
		})
		.from(best)
		.innerJoin(characters, eq(characters.id, best.characterId))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(visible);

	pipeline = redis.pipeline();
	for (let i = 0; i < bests.length; i++) {
		const b = bests[i];
		const member = beatmapMember(b.characterId, b.id);
		const value = beatmapScore(b.score, b.accuracy);
		pipeline.zadd(beatmapKey(b.beatmapId), value, member);
		pipeline.zadd(beatmapKey(b.beatmapId, b.country), value, member);
		pipeline.hset(beatmapIds(b.beatmapId), String(b.characterId), String(b.id));
		if (i % 200 === 199) {
			await pipeline.exec();
			pipeline = redis.pipeline();
		}
	}
	await pipeline.exec();
}

/** Every member's 1-based rank on one board. */
const boardRanks = async (key: string) =>
	new Map((await redis.zrevrange(key, 0, -1)).map((id, i) => [Number(id), i + 1]));

/** Append today's global pp rank to every character's stored history and
 *  record new highest ranks, once per UTC day (one worker wins the day's lock;
 *  the rest and later calls return immediately). Ranks also move when others
 *  pass or drop, so the highest ranks can't wait for the character's own play. */
export const sweepRankHistory = async (): Promise<void> => {
	for (const r of enabledRulesets()) await sweepRankHistoryOf(r);
};

const sweepRankHistoryOf = async (r: ServerRuleset): Promise<void> => {
	const { profile } = r;
	const today = new Date().toISOString().slice(0, 10);
	const doneKey = `${META}rankhistory:v4:${r.def.id}:${today}`;
	if (await redis.exists(doneKey) || !await redis.exists(builtKey(r))) return;
	const got = await redis.set(`${doneKey}:lock`, '1', 'EX', 600, 'NX');
	if (got !== 'OK') return;
	try {
		const rows = await db
			.select({
				id: profile.id, rankHistory: profile.rankHistory, country: users.country,
			})
			.from(profile)
			.innerJoin(characters, eq(characters.id, profile.id))
			.innerJoin(users, eq(users.id, characters.userId));
		const keys = new Set(rows.flatMap(row => boardKeys(r, row.country).map(([, key]) => key)));
		const boards = new Map<string, Map<number, number>>();
		for (const key of keys) boards.set(key, await boardRanks(key));
		const now = Date.now();

		for (const row of rows) {
			const ranks: BoardRanks = Object.fromEntries(boardKeys(r, row.country)
				.map(([board, key]) => [board, boards.get(key)?.get(row.id)]));
			const rank = ranks.pp;
			if (rank === undefined) continue;
			const previous = row.rankHistory ?? {
				date: '', ranks: [],
			};
			const highest = withHighest(withHistoryPeak(previous), ranks, now);
			const moved = JSON.stringify(highest) !== JSON.stringify(previous.highest ?? {});
			if (previous.date === today && !moved) continue;
			await db
				.update(profile)
				.set({
					rankHistory: {
						date: today,
						ranks: previous.date === today
							? previous.ranks
							: [...previous.ranks, rank].slice(-RANK_HISTORY_DAYS),
						highest,
					},
				})
				.where(eq(profile.id, row.id));
		}
		await redis.set(doneKey, '1', 'EX', 2 * 86_400);
	} finally {
		await redis.del(`${doneKey}:lock`);
	}
};

async function* scanKeys(match: string): AsyncGenerator<string> {
	let cursor = '0';
	do {
		const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 500);
		cursor = next;
		yield* keys;
	} while (cursor !== '0');
}

/** Whether the pp board holds exactly MySQL's characters at their pp. Fails
 *  when the database was swapped under the index (a restore, a staging clone). */
const indexMatchesDb = async (r: ServerRuleset) => {
	const { profile } = r;
	const rows = await db
		.select({
			id: profile.id, pp: profile.pp,
		})
		.from(profile)
		.innerJoin(characters, eq(characters.id, profile.id))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(visible);
	const scores = await redis.zrange(keysOf(r).globalKey('pp'), 0, -1, 'WITHSCORES');
	if (scores.length !== rows.length * 2) return false;
	const indexed = new Map<string, number>();
	for (let i = 0; i < scores.length; i += 2) indexed.set(scores[i], Number(scores[i + 1]));
	return rows.every(row => indexed.get(String(row.id)) === Number(row.pp));
};

/** Build the sets on boot unless they are already built for this schema and
 *  still match MySQL, elected to a single cluster worker. */
export async function ensureRankings(): Promise<void> {
	for (const r of enabledRulesets()) {
		if (await redis.exists(builtKey(r)) && await indexMatchesDb(r)) continue;
		const got = await redis.set(lockKey(r), '1', 'EX', 300, 'NX');
		if (got !== 'OK') continue;
		try {
			await redis.del(builtKey(r));
			await rebuildAll(r);
			await redis.set(builtKey(r), '1');
			console.log(`Rankings index built for ${r.def.id}.`);
		} finally {
			await redis.del(lockKey(r));
		}
	}
}

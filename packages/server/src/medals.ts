import {
	and,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	max,
	sql,
} from 'drizzle-orm';

import { medalXPMultiplier } from '@oss-idle/shared/achievements/catalogue';
import { OWNER_ID } from '@oss-idle/shared/groups';
import { NO_MEDALS } from '@oss-idle/shared/mods';
import type { MedalBatch } from '@oss-idle/shared/play';
import { BASE_MAX_UPGRADES } from '@oss-idle/shared/upgrades';
import {
	playLevelOf,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import { countCurated } from './beatmaps/curated';
import { countMapped } from './beatmaps/mapped';
import { db } from './db/client';
import { beatmaps } from './db/schema/beatmap';
import {
	type CharacterRow,
	characters,
	getCharacterById,
	profileOf,
	type ProfileRow,
	skillOf,
} from './db/schema/character';
import {
	addMedals,
	getMedals,
	removeMedals,
} from './db/schema/character_medal';
import { getCharacterTotals } from './db/schema/character_totals';
import { users } from './db/schema/user';
import {
	ppTopPercent,
	reindexCharacter,
} from './rankings';
import { enabledRulesets } from './rulesets/registry';
import {
	column,
	type ServerRuleset,
} from './rulesets/ruleset';
import { followerCount } from './social';
import { hasChatted } from './ws/chat';
import { hub } from './ws/hub';
import { presenceTimezone } from './ws/presence';

/** What a finished play adds that the database does not keep. */
export type PlayFacts = {
	/** how far into the map a failed play got, 0-1 */
	failedAt?: number,
	/** how many seconds into the song a failed play failed */
	failedSeconds?: number,
};

const NIGHT_OWL_HOURS = [3, 4];
const FAIL_99 = 0.99;
const EARLY_FAIL_SECONDS = 10;
/** TAG underground - POSSESSION [CHALLENGE], the "Possessed" medal's map */
const POSSESSION_ID = 1168087;
const PERFECT_SCORE = 1_000_000;
/** The Parallax II: Future Sequence [Marathon], the "Future Sequence" medal's map */
const PARALLAX_ID = 1443309;
/** Yuyoyuppe - AiAe [Wafles' SHD], the "Wonderful" medal's map */
const AIAE_ID = 421066;

// a play with a mod that earns no medals (EZ) counts for none of the play feats
const medalPlay = ({ score: scores }: ServerRuleset) =>
	and(...NO_MEDALS.map(mod => sql`find_in_set(${mod}, ${scores.mods}) = 0`));

/** Best star rating passed and full-combo'd, and the one-off score feats. */
const scoreFacts = async (r: ServerRuleset, characterId: number) => {
	const { score: scores } = r;
	// the stars a play was actually played at: a rate changes them
	const playedStars = sql`coalesce(${scores.sr}, ${beatmaps.sr})`;
	// loved maps count for none of the star medals
	const rankedStars = sql`if(${r.setStatus.status} = 'ranked', ${playedStars}, null)`;
	const [row] = await db.select({
		pass: max(sql<number>`floor(${rankedStars})`),
		fc: max(sql<number>`if(${column(scores, r.def.miss)} = 0, floor(${rankedStars}), null)`),
		topPlay: max(scores.pp),
		rice: max(sql<number>`${rankedStars} >= 4 and ${beatmaps.rice} > 0.9 * ${beatmaps.objects}`),
		ln: max(sql<number>`${rankedStars} >= 4 and ${beatmaps.ln} > 0.5 * ${beatmaps.objects}`),
		combo727: max(sql<number>`${scores.maxCombo} = 727`),
		possessed: max(sql<number>`${scores.beatmapId} = ${POSSESSION_ID}
			and ${scores.score} >= ${PERFECT_SCORE}`),
		parallax: max(sql<number>`${scores.beatmapId} = ${PARALLAX_ID}
			and ${scores.grade} in ('XX', 'X', 'SS', 'S')`),
		wonderful: max(sql<number>`${scores.beatmapId} = ${AIAE_ID}
			and ${scores.grade} in ('XX', 'X', 'SS') and ${scores.rate} >= 1`),
	})
		.from(scores)
		.innerJoin(beatmaps, eq(beatmaps.id, scores.beatmapId))
		.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmaps.setId))
		.where(and(eq(scores.characterId, characterId), medalPlay(r)));
	// no scores yet: every aggregate is null
	return {
		pass: Number(row?.pass ?? 0),
		fc: Number(row?.fc ?? 0),
		topPlay: Number(row?.topPlay ?? 0),
		rice: Number(row?.rice) > 0,
		ln: Number(row?.ln) > 0,
		combo727: Number(row?.combo727) > 0,
		possessed: Number(row?.possessed) > 0,
		parallax: Number(row?.parallax) > 0,
		wonderful: Number(row?.wonderful) > 0,
	};
};

/** #1s held on ranked maps (loved ones don't count). */
const firstPlaces = async ({ firstPlace, setStatus }: ServerRuleset, characterId: number) => {
	const [row] = await db.select({ n: count() })
		.from(firstPlace)
		.innerJoin(beatmaps, eq(beatmaps.id, firstPlace.beatmapId))
		.innerJoin(setStatus, eq(setStatus.setId, beatmaps.setId))
		.where(and(eq(firstPlace.characterId, characterId), eq(setStatus.status, 'ranked')));
	return row?.n ?? 0;
};

/** The grades set at 1.0x or faster: a slowed play's cut score is no grade. */
const fullRateGrades = async (r: ServerRuleset, characterId: number) => new Set<string>((await db
	.selectDistinct({ grade: r.score.grade })
	.from(r.score)
	.where(and(eq(r.score.characterId, characterId), medalPlay(r), sql`${r.score.rate} >= 1`)))
	.map(row => row.grade));

/** Most plays of any single map. */
const mostReplays = async ({ played }: ServerRuleset, characterId: number) => {
	const [row] = await db.select({ n: max(played.plays) })
		.from(played)
		.where(eq(played.characterId, characterId));
	return Number(row?.n ?? 0);
};

/** The account rebirthed past this character (the old one keeps the medal too). */
const rebirthedPast = async (
	{ profile }: ServerRuleset,
	character: CharacterRow,
	generation: number,
) => {
	const [row] = await db.select({ n: count() })
		.from(characters)
		.innerJoin(profile, eq(profile.id, characters.id))
		.where(and(
			eq(characters.userId, character.userId),
			gt(profile.generation, generation),
		));
	return (row?.n ?? 0) > 0;
};

const localHour = (tz: string, at: Date) => Number(new Intl.DateTimeFormat('en-US', {
	hour: 'numeric', hourCycle: 'h23', timeZone: tz,
}).format(at));

/** Minutes the zone is ahead of UTC right now. */
const utcOffset = (tz: string) => {
	const at = new Date();
	at.setUTCSeconds(0, 0);
	const local = new Date(`${at.toLocaleString('en-US', { timeZone: tz })} UTC`);
	return (local.getTime() - at.getTime()) / 60000;
};

/** Any play that ended in the night owl hours, local time. Most plays end with
 *  no result screen to award them (the queue runs in the background), so it is
 *  read off the scores rather than the clock. The database has no timezone
 *  tables: SQL takes an hour either side at today's offset (DST moves it), and
 *  the exact hour is checked here. */
const playedAtNight = async (r: ServerRuleset, characterId: number, tz: string) => {
	const { score: scores } = r;
	const offset = utcOffset(tz);
	const rows = await db.select({ at: scores.playedAt })
		.from(scores)
		.where(and(
			eq(scores.characterId, characterId),
			medalPlay(r),
			sql`hour(${scores.playedAt} + interval ${offset} minute) between 2 and 5`,
		))
		.orderBy(desc(scores.playedAt))
		.limit(500);
	return rows.some(r => r.at && NIGHT_OWL_HOURS.includes(localHour(tz, r.at)));
};

/** Everything the medal conditions read, as it stands now. */
const live = async (
	r: ServerRuleset,
	character: CharacterRow,
	profile: ProfileRow,
	play: PlayFacts,
	tz?: string,
) => {
	const id = character.id;
	const [
		facts, grades, firsts, replays, curatedMaps, mappedMaps, followers, totals, chatted, rebirthed,
		nightOwl, topPercent,
	] = await Promise.all([
		scoreFacts(r, id),
		fullRateGrades(r, id),
		firstPlaces(r, id),
		mostReplays(r, id),
		countCurated(r, character.userId),
		Promise.all([countMapped(r, character.userId, 'ranked'), countMapped(r, character.userId, 'loved')])
			.then(([ranked, loved]) => ranked + loved),
		followerCount(character.userId),
		getCharacterTotals(r, id),
		hasChatted(id),
		rebirthedPast(r, character, profile.generation),
		tz !== undefined && playedAtNight(r, id, tz),
		Number(profile.pp) > 0 ? ppTopPercent(r, id) : undefined,
	]);
	const skills = r.def.skills.map(s => skillOf(profile, s));
	return {
		...facts,
		grades,
		character,
		profile,
		skills: Object.fromEntries(r.def.skills.map((s, i) => [s, skills[i]])),
		totals,
		firsts,
		mostReplays: replays,
		curatedMaps,
		mappedMaps,
		followers,
		chatted,
		rebirthed: rebirthed || profile.generation > 1,
		nightOwl,
		topPercent,
		nearMiss: (play.failedAt ?? 0) >= FAIL_99,
		earlyFail: play.failedSeconds !== undefined && play.failedSeconds < EARLY_FAIL_SECONDS,
		// raw, as the game shows it ("2.4ω")
		overdrive: Math.max(...skills.map(s => s.overdrive)),
		prestige: skills.reduce((sum, s) => sum + s.prestige, 0),
	};
};

type Live = Awaited<ReturnType<typeof live>>;

/** What each line of threshold medals counts, by medal id prefix. */
const countersOf = (r: ServerRuleset): Record<string, (p: Live) => number> => ({
	pass: p => p.pass,
	fc: p => p.fc,
	plays: p => p.totals.playCount,
	hits: p => p.totals.hits,
	time: p => p.totals.playTime / 3600,
	friends: p => p.followers,
	...Object.fromEntries(r.def.skills.map(s => [s, (p: Live) => {
		const { level, xp, lifetimeXp, prestige } = p.skills[s];
		return Math.floor(playLevelOf(level, xp, lifetimeXp, prestige));
	}])),
	overall: p => xpGivesLevel(p.profile.overallLifetimeXp).level,
	upgrades: p => r.def.skills.reduce((sum, s) => sum + p.skills[s].upgrades, 0),
	ladders: p => r.def.skills.filter(s => p.skills[s].upgrades >= BASE_MAX_UPGRADES).length,
	overdrive: p => p.overdrive,
	prestige: p => p.prestige,
	first: p => p.firsts,
	pp: p => Number(p.profile.pp),
	'play-pp': p => p.topPlay,
	curator: p => p.curatedMaps,
	mapper: p => p.mappedMaps,
});

/** Keep each counter's best ever next to where it is now, and return the
 *  bests: a reset or a loss never takes progress back, it has to be earned
 *  past again. */
const recordBest = async (
	r: ServerRuleset,
	characterId: number,
	p: Live,
): Promise<Record<string, number>> => {
	const { progress: characterProgress } = r;
	const stored = await db.select()
		.from(characterProgress)
		.where(eq(characterProgress.characterId, characterId));
	const before = new Map(stored.map(r => [r.line, r]));
	const changed = Object.entries(countersOf(r))
		.map(([line, value]) => {
			const current = value(p);
			return {
				characterId, line, current, value: Math.max(current, before.get(line)?.value ?? 0),
			};
		})
		.filter(r => r.current !== (before.get(r.line)?.current ?? 0));
	if (changed.length) await db.insert(characterProgress)
		.values(changed)
		.onDuplicateKeyUpdate({
			set: {
				value: sql`greatest(${characterProgress.value}, values(value))`,
				current: sql`values(current)`,
			},
		});
	const best: Record<string, number> = Object.fromEntries(stored.map(r => [r.line, r.value]));
	for (const r of changed) best[r.line] = r.value;
	return best;
};

/** Everything the medal conditions read, the counters at their best ever. */
const progress = async (
	r: ServerRuleset,
	character: CharacterRow,
	play: PlayFacts,
	tz?: string,
) => {
	const now = await live(r, character, await profileOf(r, character.id), play, tz);
	return {
		...now, best: await recordBest(r, character.id, now),
	};
};

type Progress = Awaited<ReturnType<typeof progress>>;
/** When a medal is earned, and the same in words for the admin page. */
type Rule = {
	test: (p: Progress) => boolean,
	rule: string,
	/** read from stored scores and what is built from them: a score reprocess
	 *  takes it back when the replayed scores no longer earn it */
	scores?: true,
	/** the counted value (its best) and its goal, for medals earned at a threshold */
	value?: (p: Progress) => number,
	current?: (p: Progress) => number,
	goal?: number,
};

const amount = (n: number) => n.toLocaleString('en-US');

/** The counters read from a character's own stored scores and the pp and totals built
 *  from them: the lines a score reprocess rewrites. #1s and top-% ranks also depend on
 *  other players, so a reprocess leaves their medals alone (Adri: "only the most obvious
 *  ones like star rating, pp, grades"). */
export const SCORE_LINES = ['pass', 'fc', 'hits', 'pp', 'play-pp'];

/** A line of medals earned at thresholds of one counter's best. */
const series = (
	counters: Record<string, (p: Live) => number>,
	label: string,
	at: Record<string, number>,
	counter: string,
): Record<string, Rule> => Object.fromEntries(Object.entries(at).map(([id, min]) => [id, {
	test: (p: Progress) => (p.best[counter] ?? 0) >= min,
	rule: `best ${label} ≥ ${amount(min)}`,
	value: (p: Progress) => p.best[counter] ?? 0,
	current: (p: Progress) => counters[counter](p),
	goal: min,
	...SCORE_LINES.includes(counter) && { scores: true as const },
}]));

const one = (rule: string, test: (p: Progress) => boolean): Rule => ({
	test, rule,
});

/** A one-off medal read from stored scores. */
const fromScores = (rule: string, test: (p: Progress) => boolean): Rule => ({
	test, rule, scores: true,
});

const STAR_STEPS = Array.from({ length: 10 }, (_, i) => i + 1);
const SKILL_STEPS = [50, 100, 105, 110];

/** When each medal is earned, by its id without the ruleset's prefix. */
const rulesFor = (r: ServerRuleset): Record<string, Rule> => {
	const s = (label: string, at: Record<string, number>, counter: string) =>
		series(countersOf(r), label, at, counter);
	return {
		...s('best star rating (floored) among stored scores on ranked maps',
			Object.fromEntries(STAR_STEPS.map(n => [`pass-${n}`, n])), 'pass'),
		...s('best star rating (floored) among stored scores on ranked maps with 0 misses',
			Object.fromEntries(STAR_STEPS.map(n => [`fc-${n}`, n])), 'fc'),
		'grade-ss': fromScores('a stored SS, X or XX at 1.0x rate or faster',
			p => ['SS', 'X', 'XX'].some(g => p.grades.has(g))),
		'grade-x': fromScores('a stored X or XX at 1.0x rate or faster',
			p => ['X', 'XX'].some(g => p.grades.has(g))),
		'grade-xx': fromScores('a stored XX at 1.0x rate or faster', p => p.grades.has('XX')),
		'rice': fromScores('a score on a 4★+ ranked map whose single notes are over 90% of its objects',
			p => p.rice),
		'ln': fromScores('a score on a 4★+ ranked map whose long notes are over 50% of its objects',
			p => p.ln),
		...s('play count', {
			'plays-100': 100, 'plays-1k': 1_000, 'plays-5k': 5_000, 'plays-25k': 25_000, 'plays-100k': 100_000,
		}, 'plays'),
		...s('notes hit (non-miss)', {
			'hits-100k': 1e5, 'hits-1m': 1e6, 'hits-10m': 1e7, 'hits-50m': 5e7, 'hits-1b': 1e9,
		}, 'hits'),
		...s('hours played (sum of map lengths)', {
			'time-10h': 10, 'time-100h': 100, 'time-1000h': 1_000, 'time-10000h': 10_000,
		}, 'time'),
		...s('players who added the account as a friend', {
			'friends-1': 1, 'friends-5': 5, 'friends-25': 25, 'friends-100': 100, 'friends-1k': 1_000,
		}, 'friends'),
		...Object.fromEntries(r.def.skills.flatMap(skill => Object.entries(s(
			`${skill} level`,
			Object.fromEntries(SKILL_STEPS.map(n => [`${skill}-${n}`, n])),
			skill,
		)))),
		...s('overall level', {
			'overall-25': 25, 'overall-50': 50, 'overall-75': 75,
			'overall-100': 100, 'overall-105': 105, 'overall-110': 110,
		}, 'overall'),
		...s('upgrades held across all skills', {
			'upgrades-1': 1, 'upgrades-10': 10, 'upgrades-50': 50, 'upgrades-100': 100,
		}, 'upgrades'),
		...s('skills at upgrade level 10', {
			'ladders-1': 1, 'ladders-5': 5, 'ladders-10': 10, 'ladders-11': 11,
		}, 'ladders'),
		...s('highest raw overdrive on a skill (ω)', {
			'overdrive-2': 2, 'overdrive-10': 10, 'overdrive-100': 100, 'overdrive-1000': 1_000,
		}, 'overdrive'),
		...s('prestiges across all skills', {
			'prestige-1': 1, 'prestige-5': 5, 'prestige-25': 25, 'prestige-100': 100,
		}, 'prestige'),
		'rebirth': one('a reborn character, or one the account rebirthed past', p => p.rebirthed),
		...s('ranked maps currently held at #1', {
			'first-1': 1, 'first-10': 10, 'first-100': 100, 'first-1000': 1_000,
		}, 'first'),
		...s('pp', {
			'pp-1k': 1_000, 'pp-5k': 5_000, 'pp-10k': 10_000, 'pp-20k': 20_000,
		}, 'pp'),
		...Object.fromEntries([75, 50, 25, 10, 1].map(n => [`top-${n}`, one(
			`global pp rank in the top ${n}% of players with pp`,
			p => p.topPercent !== undefined && p.topPercent <= n,
		)])),
		...s('best pp of a single stored score', {
			'play-pp-50': 50, 'play-pp-100': 100, 'play-pp-200': 200,
			'play-pp-500': 500, 'play-pp-750': 750, 'play-pp-1k': 1_000,
		}, 'play-pp'),
		...s('proposed maps now approved (ranked or loved) and live', {
			'curator-1': 1, 'curator-5': 5, 'curator-25': 25, 'curator-100': 100,
		}, 'curator'),
		...s('approved (ranked or loved) and live sets the account mapped', {
			'mapper-1': 1, 'mapper-2': 2, 'mapper-5': 5, 'mapper-10': 10, 'mapper-50': 50, 'mapper-100': 100,
		}, 'mapper'),
		'combo-727': fromScores('a stored score with max combo exactly 727', p => p.combo727),
		'same-map-100': one('played a single map ≥ 100 times', p => p.mostReplays >= 100),
		'fail-99': one('the shown play failed after ≥ 99% of the map', p => p.nearMiss),
		'fail-10s': one(`the shown play failed in the song's first ${EARLY_FAIL_SECONDS} seconds`,
			p => p.earlyFail),
		'night-owl': one(
			'a play ended between 03:00 and 04:59 local time (the timezone the player is in now)',
			p => p.nightOwl,
		),
		'first-chat': one('has sent a #oss!idle chat message (counted since medals exist)', p => p.chatted),
		'possessed': fromScores(`a ${amount(PERFECT_SCORE)} score on TAG underground - POSSESSION [CHALLENGE]`,
			p => p.possessed),
		'parallax': fromScores('an S or better on The Parallax II: Future Sequence [Marathon]',
			p => p.parallax),
		'wonderful': fromScores('an SS or better on Yuyoyuppe - AiAe [Wafles\' SHD] at 1.0x rate or faster',
			p => p.wonderful),
	};
};

const rulesCache = new Map<string, Record<string, Rule>>();
const RULES = (r: ServerRuleset) => {
	let rules = rulesCache.get(r.def.id);
	if (!rules) {
		const { prefix } = r.def.medals;
		rules = Object.fromEntries(Object.entries(rulesFor(r)).map(([id, rule]) => [prefix + id, rule]));
		rulesCache.set(r.def.id, rules);
	}
	return rules;
};

/** A medal without a condition could never be earned: the server refuses to start. */
export const checkMedalRules = (): void => {
	for (const r of enabledRulesets()) {
		const unearnable = r.def.medals.medals.filter(m => !RULES(r)[m.id]).map(m => m.id);
		if (unearnable.length) throw new Error(`medals with no condition: ${unearnable.join(', ')}`);
	}
};

/** Each medal's rule in words, for the admin page. */
export const medalRules = (r: ServerRuleset): Record<string, string> =>
	Object.fromEntries(r.def.medals.medals.map(m => [m.id, RULES(r)[m.id].rule]));

/** Every medal a character qualifies for right now, held or not. Reads only. */
export const earnedMedals = async (
	r: ServerRuleset, character: CharacterRow, play: PlayFacts = {}, tz?: string,
): Promise<string[]> => {
	const p = await progress(r, character, play, tz);
	return r.def.medals.medals.filter(m => RULES(r)[m.id].test(p)).map(m => m.id);
};

/** Every medal a character qualifies for with `lines`' bests back at their live
 *  value, the other bests as stored. Reads only. */
export const earnedWithLive = async (
	r: ServerRuleset, character: CharacterRow, lines: string[],
): Promise<string[]> => {
	const now = await live(r, character, await profileOf(r, character.id), {});
	const stored = await db.select()
		.from(r.progress)
		.where(eq(r.progress.characterId, character.id));
	const best: Record<string, number> = Object.fromEntries(stored.map(row => [row.line, row.value]));
	const counters = countersOf(r);
	for (const line of lines) best[line] = counters[line](now);
	return r.def.medals.medals.filter(m => RULES(r)[m.id].test({
		...now, best,
	})).map(m => m.id);
};

/** How far a character is toward each threshold medal, at its best and now;
 *  secret ones stay secret. */
export const medalProgress = async (
	r: ServerRuleset,
	character: CharacterRow,
): Promise<Record<string, { value: number, current: number, goal: number }>> => {
	const p = await progress(r, character, {});
	return Object.fromEntries(r.def.medals.medals.flatMap(m => {
		const { value, current, goal } = RULES(r)[m.id];
		return m.category !== 'secret' && value && current && goal !== undefined
			? [[m.id, {
				value: value(p), current: current(p), goal,
			}]]
			: [];
	}));
};

/**
 * Award a ranked play's medals, for a result screen about to show it (it asks
 * with `medals: true`). It also catches up on everything earned before and never
 * shown, which is how existing characters got their backfill.
 */
export const awardMedals = async (
	r: ServerRuleset,
	characterId: number,
	play: PlayFacts,
): Promise<MedalBatch> => {
	const character = await getCharacterById(characterId);
	if (!character) return {
		ids: [], held: 0,
	};
	const tz = await presenceTimezone(characterId);
	const batch = await addMedals(r, characterId, await earnedMedals(r, character, play, tz));
	if (batch.ids.length) await reindexCharacter(r, characterId);
	return batch;
};

/** Award what was earned away from a play (a first chat, a purchase) and show it
 *  on the character's devices right away. */
export const pushMedals = async (r: ServerRuleset, characterId: number): Promise<void> => {
	const character = await getCharacterById(characterId);
	if (!character) return;
	const medals = await addMedals(r, characterId, await earnedMedals(r, character));
	if (!medals.ids.length) return;
	await reindexCharacter(r, characterId);
	hub.sendTo(characterId, {
		type: 'medals', medals,
	});
};

export type MedalChanges = { added: string[], removed: string[] };

/** The score-read medals (`scores`) against a character's stored scores as they are
 *  now, their lines' bests taken back to now: those it earns and lacks, those it holds
 *  and no longer earns. Every other medal stays as it is, to be awarded on its next
 *  play as usual. Reads only. */
export const scoreMedalChanges = async (
	r: ServerRuleset, character: CharacterRow,
): Promise<MedalChanges> => {
	const fromScores = (id: string) => RULES(r)[id]?.scores;
	const earned = new Set((await earnedWithLive(r, character, SCORE_LINES)).filter(fromScores));
	const held = (await getMedals(r, character.id)).map(m => m.medalId).filter(fromScores);
	return {
		added: [...earned].filter(id => !held.includes(id)),
		removed: held.filter(id => !earned.has(id)),
	};
};

/** After a score reprocess replayed a character: its score-read medals follow the new
 *  scores both ways, and the score lines' bests come back to now, so a medal taken back
 *  has to be earned again. Levels and xp stay as earned. */
export const recalculateMedals = async (
	r: ServerRuleset, characterId: number,
): Promise<MedalChanges> => {
	const character = await getCharacterById(characterId);
	if (!character) return {
		added: [], removed: [],
	};
	await recordProgress(r, characterId);
	const changes = await scoreMedalChanges(r, character);
	const { progress: lines } = r;
	await db.update(lines)
		.set({ value: sql`${lines.current}` })
		.where(and(eq(lines.characterId, characterId), inArray(lines.line, SCORE_LINES)));
	const batch = await addMedals(r, characterId, changes.added);
	await removeMedals(r, characterId, changes.removed);
	if (!batch.ids.length && !changes.removed.length) return changes;
	await reindexCharacter(r, characterId);
	// a character with no socket open receives nothing
	if (batch.ids.length) hub.sendTo(characterId, {
		type: 'medals', medals: batch,
	});
	return changes;
};

/** How many characters hold each medal, out of every character that has played. */
export const medalHolders = async ({ medals, totals }: ServerRuleset) => {
	const [held, [{ players }]] = await Promise.all([
		db.select({
			id: medals.medalId, n: count(),
		})
			.from(medals)
			.groupBy(sql`${medals.medalId}`),
		db.select({ players: count() })
			.from(totals)
			.where(gt(totals.playCount, 0)),
	]);
	return {
		players, held: Object.fromEntries(held.map(h => [h.id, h.n])),
	};
};

/** XP multiplier from the medals a character holds in a ruleset. */
export const medalMultiplier = async (r: ServerRuleset, characterId: number): Promise<number> =>
	medalXPMultiplier(r.def.medals, (await getMedals(r, characterId)).map(m => m.medalId));

/** The medal lines with a progress board, in medal category order. A
 *  per-account line ranks each account's current character. */
const BOARDS: Record<string, { perAccount?: true }> = {
	plays: {},
	hits: {},
	time: {},
	friends: { perAccount: true },
	overdrive: {},
	prestige: {},
	first: {},
	curator: { perAccount: true },
	mapper: { perAccount: true },
};

export const ProgressLines = Object.keys(BOARDS);

/** A line's medals and the value each is earned at. */
const lineGoals = (r: ServerRuleset, line: string) => r.def.medals.medals.flatMap(m => {
	const { goal } = RULES(r)[m.id];
	return m.id.startsWith(`${line}-`) && goal !== undefined
		? [{
			id: m.id, goal,
		}]
		: [];
});

/** Bring a character's best counters up to date. */
export const recordProgress = async (r: ServerRuleset, characterId: number) => {
	const character = await getCharacterById(characterId);
	if (character) await progress(r, character, {});
};

/** A set just went live, so its proposer's curator count rose (Adri's, if
 *  nobody proposed it). */
export const recordCurators = async (r: ServerRuleset, osuSetId: number | null) => {
	const [request] = osuSetId === null ? [] : await db.select({ userId: r.requests.userId })
		.from(r.requests)
		.where(eq(r.requests.setId, osuSetId));
	const owners = await db.select({ id: users.currentCharacter })
		.from(users)
		.where(inArray(users.id, request ? [request.userId] : [OWNER_ID]));
	for (const { id } of owners) if (id) await recordProgress(r, id);
};

/** One medal line's board: the players furthest along it, with the line's goals.
 *  A value once reached stays, even if the live one drops. */
export const progressPage = async (
	r: ServerRuleset,
	line: string,
	page: number,
	size: number,
	country?: string,
	among?: number[],
) => {
	const { progress: characterProgress } = r;
	const { perAccount } = BOARDS[line];
	const rows = await db.select({
		id: characters.id,
		name: characters.name,
		country: users.country,
		value: characterProgress.value,
		current: characterProgress.current,
	})
		.from(characterProgress)
		.innerJoin(characters, eq(characters.id, characterProgress.characterId))
		.innerJoin(users, eq(users.id, characters.userId))
		.where(and(
			eq(characterProgress.line, line),
			gt(characterProgress.value, 0),
			isNull(users.restrictedAt),
			perAccount && eq(characters.id, users.currentCharacter),
			country === undefined ? undefined : eq(users.country, country),
			among && inArray(characters.id, among.length ? among : [0]),
		))
		.orderBy(desc(characterProgress.value), characters.id)
		.limit(size)
		.offset((page - 1) * size);
	return {
		goals: lineGoals(r, line), rows,
	};
};

const PODIUM = 5;

/** Every medal line's top players, for the overview. */
export const progressOverview = (r: ServerRuleset) => Promise.all(ProgressLines.map(async line => ({
	line, ...await progressPage(r, line, 1, PODIUM),
})));

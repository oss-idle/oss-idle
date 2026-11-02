import {
	BOT_FIRST_STEPS,
	BOT_MATCH_SKILLS,
	BOT_REFINE_STEPS,
	type BotMatchFailure,
	type BotMatchLive,
	type BotMatchResult,
	botOverall,
	type BotTopScore,
} from '@oss-idle/shared/botMatch';
import {
	cleanMods,
	type Mod,
} from '@oss-idle/shared/mods';
import { SKILL } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { xpForLevel } from '@oss-idle/shared/xp';

import { play } from './api/simulate';
import {
	accuracyFromTiming,
	accuracyOf,
	type BotMatchFit,
	type BotMatchLevels,
	CEILING,
	type Counts,
	fitBot,
	type Played,
	type Target,
	type TimedScore,
} from './botMatch';
import {
	type LiveMatch,
	liveMatch,
} from './botMatchLive';
import {
	fetchManiaProfile,
	fetchMapKeys,
	fetchMapScores,
	fetchPlayedMaps,
	fetchUserScores,
	type OsuMapScore,
} from './osu/api';
import { osuChart } from './osuCharts';
import { feedScoreCache } from './scoreCache';
import { checksumOf } from './simCharts';

/** Maps taken from the player's history, on top of what osu! lists. */
const HISTORY_PLAYS = 500;
const HISTORY_PAGES = 40;
const PAGE = 100;
const KEYS_AT_ONCE = 50;
const FEWEST_PLAYS = 10;
const TOP_SCORES = 5;
/** As osu! adds up a player's best scores. */
const WEIGHT = 0.95;
/** Plays at once, across all of a match: the sims' other work comes first. */
const IN_FLIGHT = 6;
const BUSY_WAIT_MS = 1000;
/** Rested and warmed up, as for a top play. */
const STRAIN_MINUTES = 75;

export class BotMatchRefused extends Error {
	constructor(readonly failure: BotMatchFailure) {
		super(failure);
	}
}

type Chart = TimedScore & { beatmapId: number, chart: string, checksum: string, mods: Mod[] };

const rateOf = (mods: readonly string[]) => {
	if (mods.includes('DT') || mods.includes('NC')) return 1.5;
	if (mods.includes('HT') || mods.includes('DC')) return 0.75;
	return 1;
};

const countsOf = ({ statistics: s }: OsuMapScore): Counts => ({
	MARVELOUS: s.perfect ?? 0,
	PERFECT: s.great ?? 0,
	GREAT: s.good ?? 0,
	GOOD: s.ok ?? 0,
	BAD: s.meh ?? 0,
	MISS: s.miss ?? 0,
});

type Scored = { score: OsuMapScore, stars: number };

const timedOf = ({ score, stars }: Scored): TimedScore => ({
	counts: countsOf(score),
	stars,
	rate: rateOf(score.mods.map(mod => mod.acronym)),
});

/** One score a map: the player's best plays, then their first places. */
const listedScores = async (userId: number) => {
	const [first, second, firsts] = await Promise.all([
		fetchUserScores(userId, 'best'),
		fetchUserScores(userId, 'best', PAGE),
		fetchUserScores(userId, 'firsts'),
	]);
	const listed = [...firsts, ...second, ...first];
	void feedScoreCache(listed);
	return new Map(listed
		.filter(score => score.beatmap.cs === 4)
		.map((score): [number, Scored] => [score.beatmap.id, {
			score, stars: score.beatmap.difficulty_rating,
		}]));
};

/** Their scores on a map, as osu! has them now, best first. */
const liveScores = async (beatmapId: number, userId: number) => {
	const scores = await fetchMapScores(beatmapId, userId).catch(() => []);
	return scores.toSorted((a, b) => (b.pp ?? 0) - (a.pp ?? 0) || b.accuracy - a.accuracy);
};

/** Maps from a player's history, as evenly over the difficulties as they've played them. */
const historyMaps = async (userId: number, read: (pages: number) => void): Promise<number[]> => {
	const bands = new Map<number, number[]>();
	for (let page = 0; page < HISTORY_PAGES; page++) {
		const maps = await fetchPlayedMaps(userId, page * PAGE);
		for (const { beatmap_id: id, beatmap } of maps) {
			if (beatmap.mode !== 'mania') continue;
			const band = Math.floor(beatmap.difficulty_rating);
			bands.set(band, [...bands.get(band) ?? [], id]);
		}
		read(page + 1);
		if (maps.length < PAGE) break;
	}
	const rows = [...bands.values()];
	const longest = Math.max(0, ...rows.map(row => row.length));
	return Array.from({ length: longest }, (_, i) => rows.flatMap(row => row[i] ?? [])).flat();
};

/** A score with its map, undefined when osu! doesn't have the map. */
const targetOf = async (beatmapId: number, scored: Scored): Promise<Chart | undefined> => {
	const chart = await osuChart(beatmapId);
	if (!chart) return undefined;
	return {
		...timedOf(scored),
		beatmapId,
		chart,
		checksum: checksumOf(chart),
		mods: cleanMods(scored.score.mods.map(mod => mod.acronym)),
	};
};

/** What osu! lists, hardest first: the climb is soonest over, and needs few requests. */
async function* bestCharts(listed: Map<number, Scored>, live: LiveMatch, charts: Chart[]) {
	const hardness = ({ score, stars }: Scored) => stars * rateOf(score.mods.map(mod => mod.acronym));
	const best = [...listed].toSorted(([, a], [, b]) => hardness(b) - hardness(a));
	live.advance(0, best.length);
	for (const [i, [beatmapId, scored]] of best.entries()) {
		const target = await targetOf(beatmapId, scored);
		if (target) {
			charts.push(target);
			yield target;
		}
		live.advance(i + 1);
	}
	if (charts.length < FEWEST_PLAYS) throw new BotMatchRefused('too_few_plays');
}

/** A spread of everything else the player has played, as it's read. */
async function* otherCharts(
	userId: number,
	listed: Map<number, Scored>,
	live: LiveMatch,
	charts: Chart[],
) {
	live.begin('history', HISTORY_PAGES);
	const maps = (await historyMaps(userId, live.advance)).filter(id => !listed.has(id));
	live.begin('rest', HISTORY_PLAYS);
	let found = 0;
	for (let at = 0; at < maps.length && found < HISTORY_PLAYS; at += KEYS_AT_ONCE) {
		const keys = await fetchMapKeys(maps.slice(at, at + KEYS_AT_ONCE));
		const read: OsuMapScore[] = [];
		for (const { id, cs, difficulty_rating: stars } of keys) {
			if (cs !== 4 || found >= HISTORY_PLAYS) continue;
			const onMap = await liveScores(id, userId);
			read.push(...onMap);
			const target = onMap[0] && await targetOf(id, {
				score: onMap[0], stars,
			});
			if (!target) continue;
			charts.push(target);
			yield target;
			live.advance(++found);
		}
		void feedScoreCache(read);
	}
}

const skillsAt = (levels: BotMatchLevels) => Object.fromEntries(
	Object.entries({
		// not measured, and in the way of none
		[SKILL.speedjam]: CEILING,
		[SKILL.consistency]: CEILING,
		[SKILL.concentration]: CEILING,
		[SKILL.memory]: 0,
		...levels,
	}).map(([skill, level]) => {
		const whole = Math.floor(level);
		return [skill, {
			level: whole,
			xp: (level - whole) * xpForLevel(whole),
			lifetimeXp: 0,
			prestige: 0,
			upgrades: 0,
			overdrive: 0,
		}];
	}),
);

/** The match's plays, a few at a time, waiting whenever the sims are busy. */
const player = (live: LiveMatch) => {
	let active = 0;
	const waiting: (() => void)[] = [];
	const attempt = async (levels: BotMatchLevels, target: Chart): Promise<Played> => {
		for (;;) {
			const result = await play({
				checksum: target.checksum,
				state: {
					generation: 1, strainMinutes: STRAIN_MINUTES, mapPlays: 0, skills: skillsAt(levels),
				},
				rate: target.rate,
				mods: target.mods,
			}, target.chart);
			if ('error' in result) {
				if (result.status !== 429) throw new BotMatchRefused('unavailable');
				await new Promise(resolve => setTimeout(resolve, BUSY_WAIT_MS));
				continue;
			}
			live.played();
			const { counts: c } = result;
			return {
				MARVELOUS: c.MARVELOUS + c.DIVINE,
				PERFECT: c.PERFECT,
				GREAT: c.GREAT,
				GOOD: c.GOOD,
				BAD: c.BAD,
				MISS: c.MISS,
				failed: !result.passed,
				pp: result.pp,
				grade: result.grade,
			};
		}
	};
	return async (levels: BotMatchLevels, target: Target): Promise<Played> => {
		if (active >= IN_FLIGHT) await new Promise<void>(resolve => waiting.push(resolve));
		active++;
		try {
			return await attempt(levels, target as Chart);
		} finally {
			active--;
			waiting.shift()?.();
		}
	};
};

/** The bot's best plays, with what osu! calls their maps. */
const topScoresOf = async (plays: BotMatchFit<Chart>['plays']): Promise<BotTopScore[]> => {
	const top = plays.slice(0, TOP_SCORES);
	const maps = await fetchMapKeys(top.map(({ target }) => target.beatmapId)).catch(() => []);
	return top.flatMap(({ target, played }) => {
		const map = maps.find(({ id }) => id === target.beatmapId);
		return map && played.grade ? [{
			beatmapId: map.id,
			setId: map.beatmapset.id,
			title: map.beatmapset.title,
			artist: map.beatmapset.artist,
			version: map.version,
			mods: target.mods,
			rate: target.rate,
			grade: played.grade,
			pp: played.pp ?? 0,
			accuracy: accuracyOf(played),
			realAccuracy: accuracyOf(target.counts),
		}] : [];
	});
};

type MatchUser = { id: number, username: string, avatarUrl: string | null };

const resultOf = async (
	user: MatchUser,
	fit: BotMatchFit<Chart>,
	count: number,
): Promise<BotMatchResult> => {
	const profile = await fetchManiaProfile(user.id).catch(() => undefined);
	const variant = profile?.statistics.variants?.find(v => v.variant === '4k');
	const plays = fit.plays.toSorted((a, b) => (b.played.pp ?? 0) - (a.played.pp ?? 0));
	return {
		username: profile?.username ?? user.username,
		avatarUrl: user.avatarUrl ?? undefined,
		rank: variant?.global_rank,
		pp: variant?.pp,
		levels: fit.levels,
		overall: botOverall(fit.levels),
		plays: count,
		reached: fit.reached,
		real: fit.real,
		bot: fit.bot,
		performance: plays.reduce((sum, { played }, i) => sum + (played.pp ?? 0) * WEIGHT ** i, 0),
		top: await topScoresOf(plays),
	};
};

const MEASURED = BOT_MATCH_SKILLS.filter(skill => skill !== SKILL.accuracy);

/** A player's first result, from their best scores on osu!. */
export const runBotMatch = async (
	user: MatchUser,
	tell: (live: BotMatchLive) => void,
): Promise<BotMatchResult> => {
	const live = liveMatch(tell, BOT_FIRST_STEPS);
	const charts: Chart[] = [];
	const fit = await fitBot(
		MEASURED,
		bestCharts(await listedScores(user.id), live, charts),
		player(live),
		live.fit,
		{ [SKILL.accuracy]: () => accuracyFromTiming(charts) },
	);
	return resultOf(user, fit, charts.length);
};

/** The result after the rest of a player's scores: levels only climb from `first`'s, but
 *  Accuracy is read again from everything. */
export const refineBotMatch = async (
	user: MatchUser,
	first: BotMatchResult,
	tell: (live: BotMatchLive) => void,
): Promise<BotMatchResult> => {
	const live = liveMatch(tell, BOT_REFINE_STEPS);
	const listed = await listedScores(user.id);
	const charts = (await Promise.all(
		[...listed].map(([beatmapId, scored]) => targetOf(beatmapId, scored)),
	)).filter(target => target !== undefined);
	const targets = [...charts];
	const fit = await fitBot(
		MEASURED,
		otherCharts(user.id, listed, live, charts),
		player(live),
		live.fit,
		{ [SKILL.accuracy]: () => accuracyFromTiming(charts) },
		{
			levels: first.levels, targets,
		},
	);
	return resultOf(user, fit, charts.length);
};

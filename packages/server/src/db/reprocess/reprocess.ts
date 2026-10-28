/**
 * Reprocess the 4K scores set on an older score version (`version` below sim.ts SCORE_VERSION):
 * each play simulated again on the server's sim, at the skills the character had
 * when it set it (state.ts, from the dumps snapshots.ts loaded), as tired and with
 * as much memory of the map as it had then. A play whose window is ambiguous keeps
 * its stored result when that was worse. A character's plays go in order, since
 * each one tires the next; characters spread over the workers.
 *
 * --live runs beside the server: it keeps taking the plays still landing on the old
 * version and stops once the server says it simulates on SCORE_VERSION and no play started
 * before that is left. --check N plays N stored scores again on the old sim instead,
 * writing nothing, to see where each fell among what its rebuilt state could score.
 *
 * A replayed character's medals follow its new scores both ways (medals.ts
 * recalculateMedals), and once every score is replayed a last pass does it for every
 * character with 4K scores, replayed or not. --medals runs that pass alone,
 * --medals --dry-run only reports what it would add and remove.
 *
 *   tsx src/db/reprocess/reprocess.ts [--workers 24] [--live] [--only 12,34] [--check 300 --draws 16]
 *   tsx src/db/reprocess/reprocess.ts --medals [--dry-run]
 */
import { fork } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import {
	eq,
	getTableName,
	sql,
} from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import type { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import {
	afterPlay,
	type Fatigue,
	fatigueLevel,
	restedFatigue,
	warmup,
} from '@oss-idle/shared/fatigue';
import {
	type Mod,
	parseMods,
} from '@oss-idle/shared/mods';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import type { ScoreLike } from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import type {
	ManiaSim,
	SimPlay,
} from '@oss-idle/shared/rulesets/mania/sim';
import { publicSims } from '@oss-idle/shared/rulesets/mania/sims';
import { betterScore } from '@oss-idle/shared/scoreOrder';

import { activateServerI18n } from '../../i18n';
import {
	type MedalChanges,
	recalculateMedals,
	scoreMedalChanges,
} from '../../medals';
import { calculatePP } from '../../pp';
import {
	ensureRankings,
	reindexBeatmap,
	reindexCharacter,
} from '../../rankings';
import {
	redis,
	versionKey,
} from '../../redis';
import { STRAINED_4K } from '../../rulesets/mania/4k/simState';
import { runManiaPlay } from '../../rulesets/mania/simulate';
import { playStrain } from '../../rulesets/mania/xpRules';
import {
	loadRulesets,
	rulesetFor,
} from '../../rulesets/registry';
import type { ServerRuleset } from '../../rulesets/ruleset';
import {
	compareScoresPP,
	isLovedBeatmap,
	recomputeFirstPlace,
	recomputePP,
} from '../../scores';
import {
	loadSim,
	SCORE_VERSION,
	sim,
} from '../../sim';
import {
	db,
	pool,
} from '../client';
import { setNewBestPlay } from '../schema/best';
import { setNewBestPPPlay } from '../schema/best_pp';
import {
	getCharacterById,
	profileOf,
	skillOf,
} from '../schema/character';
import { refreshCharacterTotals } from '../schema/character_totals';
import type { ScoreRow } from '../schema/score';
import {
	type Anchor,
	type Profile,
	type Progress,
	type SkillsAt,
	skillsAt,
	windowsOf,
} from './state';

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : process.argv[i + 1];
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const WORKERS = Number(arg('workers') ?? 1);
const LIVE = flag('live');
const CHECK = Number(arg('check') ?? 0);
const DRAWS = Number(arg('draws') ?? 16);
/** only these characters, to try it on a few */
const ONLY = arg('only')?.split(',').map(Number);
/** A failed draw is played again this many times, then once more without failing:
 *  the stored play passed. */
const RETRIES = 4;
const CHARTS_KEPT = 64;
const WRITE_CHUNK = 500;
const POLL_MS = 15_000;

// only what the new sim reads moves a play: prestige, warm-up gear, memory forgets
const discrete = (skill: string, field: 'upgrades' | 'overdrive' | 'prestige') =>
	field === 'prestige' || (field === 'upgrades' && (skill === 'stamina' || skill === 'memory'));

const decoder = new BeatmapDecoder();
let r: ServerRuleset;
let scores: string;

type Chart = { text: string, beatmap: Beatmap, loved: boolean, stars: number };
const charts = new Map<number, Chart>();
const chartOf = async (beatmapId: number): Promise<Chart | undefined> => {
	const kept = charts.get(beatmapId);
	if (kept) {
		charts.delete(beatmapId);
		charts.set(beatmapId, kept);
		return kept;
	}
	const [row] = await query<{ chart?: string, sr: string }>(
		'SELECT chart, sr FROM beatmap WHERE id = ?', [beatmapId]);
	if (!row?.chart) return undefined;
	const chart = {
		text: row.chart,
		beatmap: decoder.decodeFromString(row.chart),
		loved: await isLovedBeatmap(r, beatmapId),
		stars: Number(row.sr),
	};
	charts.set(beatmapId, chart);
	if (charts.size > CHARTS_KEPT) charts.delete(charts.keys().next().value!);
	return chart;
};

const tupleOf = (s: ReturnType<typeof skillOf>) =>
	[s.level, s.xp, s.upgrades, s.overdrive, s.prestige, s.lifetimeXp];

/** Everything about one character the walk reads. */
type Character = {
	id: number,
	rows: ScoreRow[],
	anchors: Anchor[],
	/** memory plays per map, as each dump that moved them left them: [highest score id, plays] */
	memory: Map<number, [number, number][]>,
	divine: boolean,
	today: Profile,
};

const query = async <T>(text: string, values: unknown[]) =>
	(await pool.promise().query(text, values))[0] as T[];

const characterOf = async (id: number): Promise<Character> => {
	const rows = await db.select().from(r.score).where(eq(r.score.characterId, id)).orderBy(r.score.id);
	const [{ top }] = await query<{ top: number }>(`SELECT MAX(id) top FROM ${scores}`, []);
	type Dumped = { max_score_id: number, fatigue: number, skills?: string, profile_fatigue?: string };
	const dumps = await query<Dumped>(
		`SELECT s.max_score_id, s.fatigue, p.skills, p.fatigue profile_fatigue FROM reprocess_snapshot s
		LEFT JOIN reprocess_profile p ON p.snapshot_id = s.id AND p.character_id = ?
		ORDER BY s.max_score_id, s.id`, [id]);
	const profile = await profileOf(r, id);
	const today: Profile = {
		skills: Object.fromEntries(r.def.skills.map(s => [s, tupleOf(skillOf(profile, s))])),
		fatigue: profile.fatigue ?? undefined,
	};
	const anchors: Anchor[] = [
		...dumps.map(d => ({
			maxScoreId: d.max_score_id,
			fatigue: !!d.fatigue,
			...d.skills && {
				profile: {
					skills: JSON.parse(d.skills) as Profile['skills'],
					...d.profile_fatigue && { fatigue: JSON.parse(d.profile_fatigue) as Fatigue },
				},
			},
		})),
		// the character as it is now holds every play up to now
		{
			maxScoreId: top, fatigue: true, profile: today,
		},
	];
	const memory = new Map<number, [number, number][]>();
	for (const m of await query<{ beatmap_id: number, max_score_id: number, memory: number }>(
		`SELECT m.beatmap_id, s.max_score_id, m.memory FROM reprocess_memory m
		JOIN reprocess_snapshot s ON s.id = m.snapshot_id
		WHERE m.character_id = ? ORDER BY s.max_score_id`, [id])) {
		memory.set(m.beatmap_id, [...memory.get(m.beatmap_id) ?? [], [m.max_score_id, m.memory]]);
	}
	return {
		id, rows, anchors, memory, divine: hasUnlock(profile.generation, 'DIVINE'), today,
	};
};

/** The memory plays a dump up to `maxScoreId` held for the map. */
const memoryAt = (ch: Character, beatmapId: number, maxScoreId: number) =>
	ch.memory.get(beatmapId)?.findLast(([at]) => at <= maxScoreId)?.[1] ?? 0;

/** How a play was played: what the walk hands each one. */
type Situation = {
	skills: SkillsAt,
	fatigue: number,
	warm: number,
	plays: number,
	chart: Chart,
	/** something the sim reads moved at a play of the window we can't place */
	ambiguous: boolean,
};

/** How tired and warm a play started, `fatigue` carried from the plays before it.
 *  Before fatigue was live, every play was rested and warm. */
const tirednessAt = (
	live: boolean, fatigue: Fatigue | undefined, startedAt: number, warmGear: number,
) => {
	if (!live) return {
		fatigue: 0, warm: 1,
	};
	const tired = restedFatigue(fatigue, startedAt);
	return {
		fatigue: fatigueLevel(tired), warm: warmup(tired, warmGear),
	};
};

/** Walk a window's plays in order up to index `upTo`, tiring as each one strains
 *  (what `each` returns: its strained minutes) and remembering each map played. */
const walk = async (
	ch: Character,
	{ start, end, plays }: ReturnType<typeof windowsOf<ScoreRow>>[number],
	upTo: number,
	each: (row: ScoreRow, situation: Situation) => Promise<number>,
) => {
	const live = !!start?.fatigue;
	const memoryFrom = start?.maxScoreId ?? 0;
	let fatigue = start?.profile?.fatigue;
	const seen = new Map<number, number>();
	for (let k = 0; k <= upTo; k++) {
		const row = plays[k];
		const chart = await chartOf(row.beatmapId);
		const played = seen.get(row.beatmapId) ?? 0;
		seen.set(row.beatmapId, played + 1);
		if (!chart) continue;
		const skills = skillsAt(start, end, k / plays.length, r.def.skills, discrete);
		const lengthMs = chart.beatmap.totalLength / Number(row.rate);
		const at = row.playedAt!.getTime();
		const strained = await each(row, {
			skills,
			...tirednessAt(live, fatigue, at - lengthMs, skills.progress.stamina.upgrades),
			plays: memoryAt(ch, row.beatmapId, memoryFrom) + played,
			chart,
			ambiguous: skills.ambiguous,
		});
		if (live) fatigue = afterPlay(fatigue, lengthMs / 60_000, strained, at);
	}
};

/** One try of a play on `on`: its whole play natively when it has one, its bot through
 *  the game's engine otherwise and for a play that must not fail (`play` can't). */
const attempt = (on: ManiaSim<SkillName, ScoreLike>, play: SimPlay<SkillName>, input: {
	chart: Chart, rate: number, mods: Mod[], divine: boolean, noFail: boolean,
}) => {
	const { chart, rate, mods, divine, noFail } = input;
	if (on.play && !noFail) {
		const played = on.play({
			chart: chart.text, beatmap: chart.beatmap, play, rate, mods, divine, round: false,
			strained: STRAINED_4K, gauged: [], scoreOnly: true,
		});
		return {
			played, share: played.strainedShare,
		};
	}
	const bot = on.bot(play);
	const { played } = runManiaPlay(chart.beatmap, bot, {
		divine, rate, mods, playOn: false, noFail,
	}, false);
	return {
		played, share: bot.strainedShare(STRAINED_4K),
	};
};

const playOf = (
	progress: Record<string, Progress>,
	{ fatigue, warm, plays }: Pick<Situation, 'fatigue' | 'warm' | 'plays'>,
): SimPlay<SkillName> => ({
	progress: skill => progress[skill], fatigue, warm, plays,
});

/** One draw of a play on `on`, failing draws replayed: the stored play passed. With the
 *  minutes it strained, which tire the plays after it. */
const draw = (
	on: ManiaSim<SkillName, ScoreLike>,
	progress: Record<string, Progress>,
	ch: Character,
	row: ScoreRow,
	{ fatigue, warm, plays, chart }: Situation,
) => {
	const play = playOf(progress, {
		fatigue, warm, plays,
	});
	const input = {
		chart, rate: Number(row.rate), mods: parseMods(row.mods), divine: ch.divine,
	};
	const lengthMs = chart.beatmap.totalLength / input.rate;
	for (let i = 0; ; i++) {
		const { played, share } = attempt(on, play, {
			...input, noFail: i > RETRIES,
		});
		if (!played.failedAt) return {
			played,
			strained: playStrain(STRAINED_4K, { strainedShare: () => share }, lengthMs),
			retried: i,
		};
	}
};

/** Strained minutes of the plays already reprocessed, for the plays after them. */
const strains = new Map<number, number>();

const RESULT = ['score', 'accuracy', 'maxCombo', 'grade', 'pp', 'ur', 'pfc', 'version'] as const;

/** Write the reprocessed plays back over themselves, then everything their bests feed. */
const store = async (ch: Character, replayed: ScoreRow[]) => {
	// a map unranked, deleted or updated while the character replayed took its scores with
	// it, and a map loved since pays no pp: as they stand now, never as they were loaded
	const touched = [...new Set(replayed.map(row => row.beatmapId))];
	const alive = new Set((await query<{ id: number }>(
		`SELECT id FROM ${scores} WHERE character_id = ? AND beatmap_id IN (?)`, [ch.id, touched],
	)).map(row => row.id));
	charts.clear();
	const loved = new Set<number>();
	for (const beatmapId of touched) if (await isLovedBeatmap(r, beatmapId)) loved.add(beatmapId);
	const done = replayed.filter(row => alive.has(row.id));
	for (const row of done) if (loved.has(row.beatmapId)) row.pp = '0';

	const columns = [...RESULT, ...r.def.judgements] as (keyof ScoreRow)[];
	const table = r.score as unknown as Record<string, AnyMySqlColumn>;
	const set = Object.fromEntries(columns.map(c => [c, sql`VALUES(${table[c]})`]));
	for (let i = 0; i < done.length; i += WRITE_CHUNK) {
		await db.insert(r.score).values(done.slice(i, i + WRITE_CHUNK)).onDuplicateKeyUpdate({ set });
	}

	const maps = new Set(done.map(row => row.beatmapId));
	const standing = ch.rows.filter(row => maps.has(row.beatmapId) && alive.has(row.id));
	const byMap = Map.groupBy(standing, row => row.beatmapId);
	for (const [beatmapId, plays] of byMap) {
		await setNewBestPlay(r, plays.reduce((a, b) => betterScore(b, a) ? b : a));
		if (!loved.has(beatmapId)) {
			await setNewBestPPPlay(r, plays.reduce((a, b) => compareScoresPP(b, a) ? b : a));
		}
	}
	await refreshCharacterTotals(r, ch.id);
	await recomputePP(r, ch.id);
	await reindexCharacter(r, ch.id);
	for (const beatmapId of maps) {
		await reindexBeatmap(r, ch.id, beatmapId);
		await recomputeFirstPlace(beatmapId);
	}
	return recalculateMedals(r, ch.id);
};

type Tally = Record<
	'played' | 'kept' | 'x' | 'xLost' | 'ambiguous' | 'retried' | 'noFail' | 'noChart', number
>;

/** Stored grades a replay takes away only when the sim can't reach them: a player
 *  retried for them as long as it took (aborts are never stored). Up to X_FREE_STARS
 *  they always stay; past them, when more than X_MIN_CHANCE of X_TRIES replays reach them. */
const KEPT_GRADES: string[] = ['X', 'XX'];
const X_FREE_STARS = 2;
const X_TRIES = 1000;
const X_MIN_CHANCE = 0.005;

/** The play `drawn` gives, priced and in the stored row's shape. */
const resultOf = (row: ScoreRow, { played }: ReturnType<typeof draw>, chart: Chart): ScoreRow => ({
	...row,
	score: played.score,
	accuracy: String(played.accuracy),
	maxCombo: played.maxCombo,
	...played.counts,
	grade: played.grade,
	pp: String(chart.loved
		? 0
		: calculatePP(r.def, played, chart.text, Number(row.rate), parseMods(row.mods))),
	ur: String(played.ur),
	pfc: played.pfc,
});

/** Whether a stored X stays: on an easy map always, else when the sim still reaches it
 *  often enough. */
const keepsX = async (ch: Character, row: ScoreRow, situation: Situation) => {
	if (Number(row.sr ?? situation.chart.stars) <= X_FREE_STARS) return true;
	const play = playOf(situation.skills.progress, situation);
	const input = {
		chart: situation.chart,
		rate: Number(row.rate),
		mods: parseMods(row.mods),
		divine: ch.divine,
		noFail: false,
	};
	let reached = 0;
	for (let i = 0; i < X_TRIES; i++) {
		// the skills' syncs settle on the event loop
		if (i % 100 === 99) await sleep(0);
		const { played } = attempt(sim().mania4k, play, input);
		if (!played.failedAt && KEPT_GRADES.includes(played.grade)) reached++;
	}
	return reached / X_TRIES > X_MIN_CHANCE;
};

/** Play one row again; a row on an older version takes the result. Returns its strained
 *  minutes, which a row already on this version only needs for the plays after it. */
const replay = async (
	ch: Character, row: ScoreRow, situation: Situation, tally: Tally, done: ScoreRow[],
) => {
	const current = row.version >= SCORE_VERSION;
	const cached = strains.get(row.id);
	if (current && cached !== undefined) return cached;
	const drawn = draw(sim().mania4k, situation.skills.progress, ch, row, situation);
	const { strained } = drawn;
	strains.set(row.id, strained);
	if (current) return strained;

	tally.played++;
	if (drawn.retried) tally.retried++;
	if (drawn.retried > RETRIES) tally.noFail++;
	if (situation.ambiguous) tally.ambiguous++;
	const result = resultOf(row, drawn, situation.chart);
	const x = KEPT_GRADES.includes(row.grade) && await keepsX(ch, row, situation);
	if (x) tally.x++;
	else if (KEPT_GRADES.includes(row.grade)) tally.xLost++;
	// an ambiguous window only ever lowers a play
	const keep = x || (situation.ambiguous && betterScore(result, row));
	if (keep) tally.kept++;
	Object.assign(row, keep ? {} : result, { version: SCORE_VERSION });
	done.push(row);
	return strained;
};

const reprocessCharacter = async (id: number) => {
	const started = Date.now();
	// a map changed since another character played it (loved, updated) is read again
	charts.clear();
	const ch = await characterOf(id);
	const tally: Tally = {
		played: 0, kept: 0, x: 0, xLost: 0, ambiguous: 0, retried: 0, noFail: 0, noChart: 0,
	};
	const done: ScoreRow[] = [];
	for (const window of windowsOf(ch.anchors, ch.rows)) {
		const last = window.plays.findLastIndex(row => row.version < SCORE_VERSION);
		if (last === -1) continue;
		await walk(ch, window, last, async (row, situation) => replay(ch, row, situation, tally, done));
		// a play on a map we no longer have is left as it was, but done
		for (const row of window.plays.slice(0, last + 1).filter(row => row.version < SCORE_VERSION)) {
			tally.noChart++;
			row.version = SCORE_VERSION;
			done.push(row);
		}
	}
	if (!done.length) return;
	const medals = await store(ch, done);
	const seconds = Math.round((Date.now() - started) / 1000);
	console.log(`character ${id}: ${done.length} plays in ${seconds}s`, JSON.stringify(tally),
		medalsLog(medals));
};

const medalsLog = ({ added, removed }: MedalChanges) =>
	added.length || removed.length ? `medals +[${added.join(' ')}] -[${removed.join(' ')}]` : '';

/** Every character with 4K scores, its medals against its scores now: applied, or with
 *  `dryRun` only told. With how many characters gain and lose each medal. */
const medalPass = async (dryRun: boolean) => {
	const ids = await query<{ id: number }>(`SELECT DISTINCT character_id id FROM ${scores}`, []);
	const totals = new Map<string, { added: number, removed: number }>();
	for (const { id } of ids) {
		const character = await getCharacterById(id);
		if (!character) continue;
		const changes = dryRun ? await scoreMedalChanges(r, character) : await recalculateMedals(r, id);
		if (!changes.added.length && !changes.removed.length) continue;
		console.log(`character ${id} ${character.name}: ${medalsLog(changes)}`);
		for (const [ids, side] of [[changes.added, 'added'], [changes.removed, 'removed']] as const) {
			for (const medal of ids) {
				const t = totals.get(medal) ?? {
					added: 0, removed: 0,
				};
				t[side]++;
				totals.set(medal, t);
			}
		}
	}
	console.log(`\nmedals ${dryRun ? 'that would change' : 'changed'} over ${ids.length} characters:`);
	for (const [medal, t] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
		console.log(`  ${medal}: +${t.added} -${t.removed}`);
	}
};

/** The plays the server started before it simulated on SCORE_VERSION and has not stored yet. */
const oldPlaysPending = async () => {
	const prefix = versionKey.slice(0, -'score-version'.length);
	let cursor = '0';
	do {
		const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}play:*`, 'COUNT', 500);
		cursor = next;
		for (const key of keys) {
			const play = JSON.parse(await redis.get(key) ?? '{}') as { draft?: { version?: number } };
			if (play.draft && (play.draft.version ?? 1) < SCORE_VERSION) return true;
		}
	} while (cursor !== '0');
	return false;
};

/** No old play can land any more: the server simulates on SCORE_VERSION and none it started before is left. */
const settled = async () =>
	Number(await redis.get(versionKey) ?? 0) >= SCORE_VERSION && !await oldPlaysPending();

/** A worker's hold on a character while it replays it: one worker per character. */
const claimKey = (id: number | string) => `${versionKey}:claim:${id}`;
const CLAIM_S = 24 * 3600;

/** The characters with plays left on an older version, the most plays first. */
const pendingCharacters = () => query<{ character_id: number }>(
	`SELECT character_id FROM ${scores} WHERE version < ?${ONLY ? ' AND character_id IN (?)' : ''}
	GROUP BY character_id ORDER BY COUNT(*) DESC`, [SCORE_VERSION, ONLY]);

/** Replay every pending character no other worker holds. How many it took. */
const takeCharacters = async (shard: number, pending: { character_id: number }[]) => {
	let took = 0;
	for (const { character_id } of pending) {
		if (await redis.set(claimKey(character_id), shard, 'EX', CLAIM_S, 'NX') !== 'OK') continue;
		try {
			await reprocessCharacter(character_id);
			took++;
		} finally {
			await redis.del(claimKey(character_id));
		}
	}
	return took;
};

const work = async (shard: number) => {
	let quiet = 0;
	for (;;) {
		const pending = await pendingCharacters();
		if (await takeCharacters(shard, pending)) {
			quiet = 0;
			continue;
		}
		// whatever is left, other workers hold
		if (!LIVE) return;
		// twice in a row: a play leaves Redis a moment before its score is stored
		quiet = !pending.length && await settled() ? quiet + 1 : 0;
		if (quiet >= 2) return;
		await sleep(POLL_MS);
	}
};

/** Where a stored score falls among `draws` plays of its rebuilt state, 0 worst to 1 best. */
const rankAmong = (row: ScoreRow, draws: number[]) =>
	draws.reduce((n, score) => n + (row.score > score ? 1 : row.score === score ? 0.5 : 0), 0)
	/ draws.length;

const deciles = (ranks: number[]) => Array.from({ length: 10 }, (_, d) =>
	ranks.filter(x => Math.min(9, Math.floor(x * 10)) === d).length).join(' ');

/** Replay sampled scores on the old sim at their rebuilt state and at today's: where
 *  the stored score lands among each. Even deciles mean the state is right. */
const check = async () => {
	const rebuilt: number[] = [];
	const today: number[] = [];
	const ids = await query<{ id: number, character_id: number }>(
		`SELECT id, character_id FROM ${scores}
		WHERE id > (SELECT MIN(max_score_id) FROM reprocess_snapshot)
		ORDER BY RAND() LIMIT ?`, [CHECK * 20]);
	for (const sample of ids) {
		if (rebuilt.length >= CHECK) break;
		const ch = await characterOf(sample.character_id);
		const window = windowsOf(ch.anchors, ch.rows).find(w => w.plays.some(p => p.id === sample.id))!;
		const at = window.plays.findIndex(p => p.id === sample.id);
		// the rest of the window plays first, for fatigue: keep it short
		if (at > 50) continue;
		await walk(ch, window, at, async (row, situation) => {
			const old = situation.skills.old;
			if (!old) return 0;
			if (row.id !== sample.id) {
				return draw(publicSims.mania4k, old, ch, row, situation).strained;
			}
			const now = Object.fromEntries(r.def.skills.map(s => {
				const [level, xp, upgrades, overdrive, prestige, lifetimeXp] = ch.today.skills[s];
				return [s, {
					level, xp, upgrades, overdrive, prestige, lifetimeXp,
				}];
			}));
			const scores = (progress: Record<string, Progress>) => Array.from({ length: DRAWS },
				() => draw(publicSims.mania4k, progress, ch, row, situation).played.score);
			rebuilt.push(rankAmong(row, scores(old)));
			today.push(rankAmong(row, scores(now)));
			console.log(`${rebuilt.length}/${CHECK} score ${row.id}:`
				+ ` rebuilt ${rebuilt.at(-1)!.toFixed(2)}, today ${today.at(-1)!.toFixed(2)}`);
			return 0;
		});
	}
	const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3);
	console.log('\nstored score among draws, deciles worst to best (even = right),'
		+ ' mean (0.5 = right):');
	console.log(`  rebuilt state: ${deciles(rebuilt)}  mean ${mean(rebuilt)}`);
	console.log(`  today's state: ${deciles(today)}  mean ${mean(today)}`);
};

const older = async () => (await query<{ n: number }>(
	`SELECT COUNT(*) n FROM ${scores} WHERE version < ?`, [SCORE_VERSION]))[0].n;

/** This script again as worker `shard`, to its exit code. */
const worker = (shard: number) => new Promise<number>(resolve => {
	const args = [...process.argv.slice(2), '--worker', String(shard)];
	fork(process.argv[1], args, { execArgv: process.execArgv }).on('exit', code => resolve(code ?? 1));
});

const main = async () => {
	activateServerI18n();
	await loadRulesets();
	await loadSim();
	r = rulesetFor('mania4k');
	scores = getTableName(r.score);
	const shard = arg('worker');

	if (shard !== undefined) {
		if (sim().name !== 'private' && !flag('public')) throw new Error('the private sim is not installed (--public to play the public one)');
		await work(Number(shard));
	} else if (CHECK) {
		await check();
	} else if (flag('medals')) {
		// the top-% medals read the rankings
		await ensureRankings();
		await medalPass(flag('dry-run'));
	} else {
		await ensureRankings();
		// a worker that died holding a character must not keep it
		for (const key of await redis.keys(claimKey('*'))) await redis.del(key);
		console.log(`${await older()} scores below version ${SCORE_VERSION}, ${WORKERS} workers`
			+ `${LIVE ? ', live' : ''}, sim ${sim().name} ${sim().version}`);
		const codes = await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
		console.log(`done: ${await older()} scores left below version ${SCORE_VERSION}`);
		if (codes.some(Boolean)) process.exitCode = 1;
		else await medalPass(false);
	}
	await redis.quit();
	process.exit(process.exitCode ?? 0);
};

void main();

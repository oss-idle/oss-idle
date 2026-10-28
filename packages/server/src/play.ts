import { randomUUID } from 'node:crypto';

import {
	STATUS,
	type Status,
} from '@oss-idle/shared/community/presence';
import type { Grade } from '@oss-idle/shared/grade';
import {
	cleanMods,
	isRankedMods,
	type Mod,
	modsKey,
	parseMods,
	retriesOnFail,
} from '@oss-idle/shared/mods';
import type {
	PlayDeltas,
	PlayResult,
	PlayState,
} from '@oss-idle/shared/play';
import { LEAD_IN_MS } from '@oss-idle/shared/play';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { ScoreDTO } from '@oss-idle/shared/score';

import {
	getBeatmap,
	getLiveBeatmap,
} from './beatmaps';
import {
	boardDifficulty,
	hasUnrankedBoard,
	recordUnrankedScore,
} from './beatmaps/unrankedBoard';
import { applyPendingAction } from './character/pending';
import { pushCharacter } from './character/push';
import { playerFor } from './character/ruleset';
import {
	type CharacterRow,
	profileOf,
} from './db/schema/character';
import { getCharacterTotals } from './db/schema/character_totals';
import {
	type NewScoreRow,
	type ScoreRow,
	toScoreDTO,
} from './db/schema/score';
import { isRestricted } from './db/schema/user';
import {
	isProd,
	redisKeyPrefix,
} from './env';
import { addFatigue } from './fatigue';
import { awardMedals } from './medals';
import { count } from './metrics';
import {
	calculatePP,
	starsAt,
} from './pp';
import { playEnded } from './queue';
import {
	globalRank,
	reindexBeatmap,
	reindexCharacter,
} from './rankings';
import { redis } from './redis';
import type { PlaySample } from './rulesets/play';
import {
	rulesetFor,
	rulesetOfChart,
} from './rulesets/registry';
import type { ServerRuleset } from './rulesets/ruleset';
import {
	applySkillXp,
	submitScore,
} from './scores';
import { hub } from './ws/hub';
import { update as updatePresence } from './ws/presence';

export type { PlaySample };

/** A finished play's result stays fetchable this long (resume / cross-tab). */
const RESULT_TTL_MS = 10 * 60 * 1000;
const RESULT_BREATH_TTL_MS = 5 * 1000;
const ONLINE_TTL = 60 * 60 * 1000;

/** How far ahead of the live position the client may know its replay. The client
 *  streams offsets in; the server reveals only those whose note is within this
 *  window of the live position, so a cheater can't read the whole outcome up front. */
const STREAM_BUFFER_MS = 5000;

/** A play's full server-side state. `offsets`/`reveals` are parallel and sorted by
 *  reveal time (the offset's note nominal time), so streaming is a simple cursor. */
type Pending = {
	token: string,
	/** the map's ruleset: the play scores, levels and ranks there */
	ruleset: RulesetId,
	characterId: number,
	beatmapId: number,
	/** read only by the ruleset's client */
	offsets: unknown[],
	reveals: number[],
	startedAt: number,
	/** when the play really ends: a failed one, at its fail. Never sent out */
	endsAt: number,
	songStartMs: number,
	/** the map's last note, where every viewer is told the play ends */
	songEndMs?: number,
	draft: NewScoreRow,
	skillXp: Record<string, number>,
	/** the play's minutes and those its physical skills were strained, for fatigue once it pays */
	strain?: { minutes: number, strained: number },
	/** how tired the character played it, 0 rested to 1 exhausted */
	fatigue?: number,
	/** how warmed up, 0 cold to 1 warm */
	warmup?: number,
	/** where on the warm-up bar, 0 cold to 1 exhausted */
	warmupBar?: number,
	samples?: PlaySample[],
	skipped?: true,
	failedAt?: number,
	/** how far into the map a failed play got, 0-1 (a medal checks it) */
	failProgress?: number,
	/** seconds into the song a failed play failed, at its rate (a medal checks it) */
	failSeconds?: number,
	/** NF in a match round: played on the server, never submitted */
	unranked?: true,
	/** scored on a player's unranked map's leaderboard: no XP, no pp, nothing ranked */
	board?: 'unranked',
};

/** The end a client is told: the map's, so a fail can't be read off it before it streams in. */
const shownEnd = (p: Pending): number =>
	p.songEndMs === undefined ? p.endsAt : p.startedAt + LEAD_IN_MS + p.songEndMs;

/** Per-skill XP progression returned to the result screen. */
type Gains = Awaited<ReturnType<typeof applySkillXp>>;

/** The finished result. `notify` drives the one-shot idle-poll popup: true only
 *  when finalised server-side (the sweep), so a result a client already saw on
 *  its own result screen isn't re-surfaced as a "missed" score. */
type StoredResult = { ruleset: RulesetId, player: number } & (
	| { token: string; failed: true; notify: boolean; failProgress?: number; failSeconds?: number }
	| {
		token: string;
		failed: false;
		score: ScoreDTO;
		gains: Gains;
		deltas: PlayDeltas;
		notify: boolean;
	});

/** A result before it is stored with its ruleset. */
type ParsedResult = StoredResult extends infer T
	? T extends unknown ? Omit<T, 'ruleset' | 'player'> : never
	: never;

/** Plays and results stored before rulesets were 4K ones. */
const BEFORE_RULESETS = { ruleset: 'mania4k' } as const;

const PLAYING_KEY = `${redisKeyPrefix}playing`;
const ONLINE_KEY = `${redisKeyPrefix}online`;
const playKey = (characterId: number) => `${redisKeyPrefix}play:${characterId}`;
const resultKey = (characterId: number) => `${redisKeyPrefix}result:${characterId}`;

/**
 * Acquire the per-character start lock or refuse. A Lua script so the check and
 * the set are atomic across workers: two cold starts racing on different
 * processes can't both pass into simulation. The lock is a member of the
 * `playing` set scored by the time it stays held. Returns 1 if acquired, 0 if a
 * start is already in flight.
 */
const ACQUIRE_PLAY = `
local held = redis.call('ZSCORE', KEYS[1], ARGV[1])
if held and tonumber(held) > tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
return 1
`;

/**
 * Atomically read-validate-delete the active play, returning its JSON only when
 * it exists and belongs to `characterId`. The delete is part of the script, so
 * concurrent sweep/finalise calls can't submit the same score twice.
 */
const TAKE_PLAY = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
if cjson.decode(v).characterId ~= tonumber(ARGV[1]) then return false end
redis.call('DEL', KEYS[1])
return v
`;

/** Like TAKE_PLAY but also requires the token to match - a stale client must not
 *  abort a newer play. */
const ABORT_PLAY = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
local d = cjson.decode(v)
if d.characterId ~= tonumber(ARGV[1]) then return false end
if d.token ~= ARGV[2] then return false end
redis.call('DEL', KEYS[1])
return v
`;

/**
 * Persist a lead-in skip: shift the whole timeline earlier so the live position
 * jumps to `songStartMs` and the play finalises that much sooner. Token must match.
 * Re-scores the play in `playing` by the new end. A re-fire is a no-op: once at/past
 * `songStartMs` the delta is <= 0.
 */
const SKIP_PLAY = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
local d = cjson.decode(v)
if d.characterId ~= tonumber(ARGV[1]) then return false end
if d.token ~= ARGV[2] then return false end
local now = tonumber(ARGV[3])
local pos = now - d.startedAt - tonumber(ARGV[4])
local delta = d.songStartMs - pos
if delta <= 0 then return v end
d.startedAt = d.startedAt - delta
d.endsAt = d.endsAt - delta
d.skipped = true
local out = cjson.encode(d)
redis.call('SET', KEYS[1], out)
redis.call('ZADD', KEYS[2], d.endsAt, ARGV[1])
return out
`;

/**
 * Debug: shift the whole timeline so the play ends right now, making its
 * already-simulated result readable without waiting the map out in real time.
 * The outcome itself is fixed at start, so this only changes *when* it can be
 * read - which is still real progression, hence the production refusal at the
 * call site. Token must match; a re-fire is a no-op.
 */
const FINISH_PLAY = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
local d = cjson.decode(v)
if d.characterId ~= tonumber(ARGV[1]) then return false end
if d.token ~= ARGV[2] then return false end
local now = tonumber(ARGV[3])
local delta = d.endsAt - now
if delta <= 0 then return v end
d.startedAt = d.startedAt - delta
d.endsAt = d.endsAt - delta
d.skipped = true
local out = cjson.encode(d)
redis.call('SET', KEYS[1], out)
redis.call('ZADD', KEYS[2], d.endsAt, ARGV[1])
return out
`;

/** Debug xp scaling, applied once as the play is stored so every later read -
 *  result screen, totals, rankings - agrees on what the play was worth. */
const scaleXp = (
	xp: Record<string, number>,
	multiplier: number,
): Record<string, number> => {
	if (multiplier <= 1) return xp;
	for (const name of Object.keys(xp)) xp[name] = Math.floor(xp[name] * multiplier);
	return xp;
};

/** Mark a character active now (presence + the "online in the last hour" set). */
const markOnline = (characterId: number) => redis.zadd(ONLINE_KEY, Date.now(), String(characterId));

/** Count of characters currently mid-play: members whose end is still ahead. */
export async function getPlaying(): Promise<number> {
	return redis.zcount(PLAYING_KEY, Date.now(), '+inf');
}

/** Count of characters seen within the last hour (never below those playing). */
export async function getOnline(): Promise<number> {
	await redis.zremrangebyscore(ONLINE_KEY, '-inf', Date.now() - ONLINE_TTL);
	const c = await redis.zcard(ONLINE_KEY);
	return Math.max(await getPlaying(), c);
}

type OffsetChunk = {
	offsets: unknown[],
	next: number,
	done: boolean,
};

type RankedStartPlayResult = {
	status: 'ranked',
	ruleset: RulesetId,
	joined: boolean,
	token: string,
	/** what is actually being played - a join can differ from the requested map */
	beatmapId: number,
	rate: number,
	mods: Mod[],
	startedAt: number,
	endsAt: number,
	serverNow: number,
	fatigue: number,
	warmup: number,
	warmupBar?: number,
	/** which way the map moves the warm-up bar, -3 cooling to 3 warming */
	warmupTrend?: number,
} & OffsetChunk;

/** The offsets revealed so far: every one whose note is within the buffer window
 *  of the live position. `next` is the resume cursor; `done` once all are sent. */
function chunkFrom(p: Pending, from: number): OffsetChunk {
	const horizon = Date.now() - p.startedAt - LEAD_IN_MS + STREAM_BUFFER_MS;
	let i = Math.max(0, from);
	while (i < p.reveals.length && p.reveals[i] <= horizon) i++;
	return {
		offsets: p.offsets.slice(from, i), next: i, done: i >= p.offsets.length,
	};
}

type StartPlayResult = RankedStartPlayResult
	| { status: 'unranked', fatigue: number, warmup: number, warmupBar: number }
	| { status: 'refused' }
	| { status: 'restricted' };

/** When each character's play ends - moved by a skip or a debug finish - or
 *  undefined once it is over. */
export const playEnds = async (characterIds: number[]): Promise<(number | undefined)[]> => {
	if (!characterIds.length) return [];
	const ends = await redis.zmscore(PLAYING_KEY, ...characterIds.map(String));
	const now = Date.now();
	return ends.map(e => e !== null && Number(e) > now ? Number(e) : undefined);
};

/** A live play's start and checkpoints, for the multiplayer scoreboard. */
type Timeline = Pick<
	Pending, 'ruleset' | 'startedAt' | 'endsAt' | 'samples' | 'draft' | 'failedAt'
>;
export const playTimeline = async (characterId: number): Promise<Timeline | undefined> =>
	readPlay(characterId);

/** Read the active play (if any) without claiming it. */
async function readPlay(characterId: number): Promise<Pending | undefined> {
	const raw = await redis.get(playKey(characterId));
	return raw ? {
		...BEFORE_RULESETS, ...JSON.parse(raw) as Pending, 
	} : undefined;
}

/** True while the character has a live (not-yet-ended) play. */
export const isPlaying = async (characterId: number): Promise<boolean> => {
	const endsAt = Number(await redis.zscore(PLAYING_KEY, String(characterId)));
	return endsAt > Date.now();
};

/** The presence patch reflecting a character's in-progress play, or null when
 *  they aren't mid-play. Lets the socket restore `playing` on (re)connect - a
 *  fresh join() otherwise stores an idle entry and clobbers the server-set
 *  `playing`, so a player who reconnects mid-play shows idle. */
export const livePlayPresence = async (
	characterId: number,
): Promise<{ status: Status; nowPlaying: string } | null> => {
	if (!(await isPlaying(characterId))) return null;
	const play = await readPlay(characterId);
	if (!play) return null;
	const beatmap = await getBeatmap(play.beatmapId);
	if (!beatmap) return null;
	return {
		status: STATUS.playing,
		nowPlaying: `${beatmap.artist} - ${beatmap.title}`,
	};
};

const rateOf = (p: Pending): number => Number(p.draft.rate ?? 1);
const modsOf = (p: Pending): Mod[] => parseMods(p.draft.mods);

const joinResult = (p: Pending): StartPlayResult => ({
	status: 'ranked',
	ruleset: p.ruleset,
	joined: true,
	token: p.token,
	beatmapId: p.beatmapId,
	rate: rateOf(p),
	mods: modsOf(p),
	startedAt: p.startedAt,
	endsAt: shownEnd(p),
	serverNow: Date.now(),
	fatigue: p.fatigue ?? 0,
	warmup: p.warmup ?? 1,
	warmupBar: p.warmupBar,
	warmupTrend: p.strain && rulesetFor(p.ruleset).play.warmupTrend(p.strain),
	...chunkFrom(p, 0),
});

/** What a character is playing right now, for anybody who asks: the map, how it is
 *  being played, when it ends and the warm-up its HUD is drawing. `undefined` once the
 *  play is over or finalised.
 *
 *  Everything here is already public. The online list broadcasts `playing` and the map's
 *  name to every connected client (`livePlayPresence`), and the warm-up numbers are a
 *  function of the character's own fatigue. Like `joinResult` it sends `shownEnd` and
 *  never the real `endsAt`, so a fail still cannot be read before it streams in. */
export const livePlay = async (characterId: number) => {
	const p = await readPlay(characterId);
	if (!p || Date.now() >= shownEnd(p)) return undefined;
	return {
		ruleset: p.ruleset,
		beatmapId: p.beatmapId,
		rate: rateOf(p),
		mods: modsOf(p),
		// the play's clock, LEAD_IN_MS of lead-in included
		startedAt: p.startedAt,
		endsAt: shownEnd(p),
		// false for a match round or an unranked map's own leaderboard
		ranked: !p.unranked && !p.board,
		fatigue: p.fatigue ?? 0,
		warmup: p.warmup ?? 1,
		warmupBar: p.warmupBar,
		warmupTrend: p.strain && rulesetFor(p.ruleset).play.warmupTrend(p.strain),
	};
};

export type LivePlay = NonNullable<Awaited<ReturnType<typeof livePlay>>>;

/** Join the play already in progress for this character (spectate), or null to
 *  start a fresh one. An overdue play (past its end, sweep hasn't run) is
 *  finalised first so a new play can begin. */
async function joinExisting(characterId: number): Promise<StartPlayResult | null> {
	const existing = await readPlay(characterId);
	if (!existing) return null;
	if (Date.now() < existing.endsAt) return joinResult(existing);
	await finalizePlay(characterId);
	return null;
}

/**
 * Start a play, or join the one already in progress for this character.
 *  - 'ranked'   - simulated (or joined); the offsets + start time let the client
 *                 reproduce the play seeked to its live position.
 *  - 'unranked' - the map isn't ingested; the client plays it locally.
 *  - 'refused'  - a cold-start race lost the lock and no record had landed yet;
 *                 the client retries (its spectate poll picks the play up too).
 */
export type PlayOptions = {
	/** debug xp scaling; the ws handler pins it to 1 in production */
	xpMultiplier?: number,
	/** the playback rate asked for, held to what the character's Speed upgrades unlock */
	rate?: number,
	mods?: Mod[],
	/** a match round: NF plays here unsubmitted, and a fail plays on to the end */
	round?: boolean,
	/** onto a player's unranked map's leaderboard: no XP, no pp, nothing ranked */
	board?: boolean,
};

/** How tired and warmed up the character plays right now, in a ruleset. */
const tiredness = async (r: ServerRuleset, character: CharacterRow) =>
	r.play.tiredness(await profileOf(r, character.id));

/** A local play: tired as the character is in the map's ruleset, or the one it picked. */
const unranked = async (character: CharacterRow, r = rulesetFor(character.ruleset)) => ({
	status: 'unranked' as const, ...await tiredness(r, character),
});

/** The ruleset that plays the map, and the character that plays it for `character`: a
 *  reborn character's other rulesets are played by an earlier one, for this play. None
 *  when no ruleset here plays the map (it is the client's own) or no character may. */
const whoPlays = async (character: CharacterRow, beatmapId: number) => {
	const chart = await getBeatmap(beatmapId);
	const r = chart && rulesetOfChart(chart.mode, chart.keys);
	const player = r && await playerFor(character, r);
	return r && player && {
		r, player,
	};
};

export async function startPlay(
	character: CharacterRow,
	beatmapId: number,
	options: PlayOptions = {},
): Promise<StartPlayResult> {
	if (await isRestricted(character.userId)) return { status: 'restricted' };
	await markOnline(character.id);

	// Already playing? Join it (spectate) rather than starting a second.
	const joined = await joinExisting(character.id);
	if (joined) return joined;

	// a solo NF play is the client's own, like any unranked one
	const mods = cleanMods(options.mods ?? []);
	if (!options.round && !isRankedMods(mods)) return unranked(character);

	const who = await whoPlays(character, beatmapId);
	if (!who) return unranked(character);
	const { r, player } = who;

	// Provisional 60s lock so a near-simultaneous cold start is held off while
	// this one simulates. Atomic across workers (see ACQUIRE_PLAY).
	const now = Date.now();
	const acquired = await redis.eval(
		ACQUIRE_PLAY, 
		1, 
		PLAYING_KEY, 
		String(character.id), 
		String(now),
		String(now + 60000),
	) as number;
	if (acquired !== 1) {
		// Someone else is mid-simulation; if their record has landed, join it.
		const raced = await readPlay(character.id);
		if (raced) return joinResult(raced);
		const held = Number(await redis.zscore(PLAYING_KEY, String(character.id)));
		console.log(
			character.id, 
			character.name,
			'tried playing at once. remaining cooldown: ',
			held - now,
		);
		return { status: 'refused' };
	}
	const profile = await profileOf(r, player.id);
	const play = {
		...options, mods, rate: r.play.allowedRate(profile, options.rate ?? 1),
	};
	const beatmap = await getLiveBeatmap(r, beatmapId);
	if (beatmap) return simulateAndStore(r, character, player, beatmapId, beatmap, play);
	// A player's unranked map with a leaderboard (or one a supporter opens) plays like a
	// ranked one, onto that board only.
	const board = await boardDifficulty(beatmapId, character.userId);
	if (board) {
		return simulateAndStore(r, character, player, beatmapId, board, {
			...play, board: true,
		});
	}
	// Any other unranked diff, or one whose set isn't live, plays like an unknown map: local play, no submit.
	await redis.zrem(PLAYING_KEY, String(character.id));
	return unranked(character, r);
}

/** Run the authoritative simulation, compute the score + XP, and store the play.
 *  The provisional lock is already held; this promotes it to the real end time.
 *  `character`'s devices run the play; `player` plays it and earns it - another of
 *  the account's characters when `character` doesn't play the ruleset. */
async function simulateAndStore(
	r: ServerRuleset,
	character: CharacterRow,
	player: CharacterRow,
	beatmapId: number,
	beatmap: Awaited<ReturnType<typeof getBeatmap>>,
	{
		xpMultiplier = 1, rate = 1, mods = [], round = false, board = false,
	}: PlayOptions,
): Promise<StartPlayResult> {
	const profile = await profileOf(r, player.id);
	const tired = r.play.tiredness(profile);
	const { fatigue, warmup: warm, warmupBar: bar } = tired;
	const stars = rate === 1 ? Number(beatmap.sr) : starsAt(beatmap.chart, rate);
	const played = await r.play.simulate(r, {
		character: player, profile, beatmapId, chart: beatmap.chart, sr: stars, rate, mods, round, board, tired,
	});

	const pp = calculatePP(r.def, played, beatmap.chart, rate, mods);

	const draft: NewScoreRow = {
		characterId: player.id,
		beatmapId,
		score: played.score,
		accuracy: String(played.accuracy),
		maxCombo: played.maxCombo,
		...played.counts,
		grade: played.grade,
		pp: String(pp),
		ur: String(played.ur),
		pfc: played.pfc,
		playedAt: new Date(),
		rate: String(rate),
		sr: String(stars),
		mods: modsKey(mods),
	};

	const startedAt = Date.now();
	const endsAt = startedAt + LEAD_IN_MS + played.endSongTime;

	const token = randomUUID();
	const entry: Pending = {
		token,
		ruleset: r.def.id,
		characterId: character.id,
		beatmapId,
		offsets: played.offsets,
		reveals: played.reveals,
		startedAt,
		endsAt,
		songStartMs: played.songStartMs,
		songEndMs: played.lastNoteEnd,
		draft,
		samples: played.samples,
		skillXp: scaleXp(played.skillXp, xpMultiplier),
		fatigue,
		warmup: warm,
		warmupBar: bar,
		...played.failedAt ? {
			failedAt: played.failedAt, failProgress: played.failProgress, failSeconds: played.failSeconds,
		} : {},
		...board ? { board: 'unranked' as const } : { strain: played.strain },
	};
	if (!isRankedMods(mods)) entry.unranked = true;
	await redis.set(playKey(character.id), JSON.stringify(entry));

	// Promote the provisional lock to the real end time (drives the sweep + count).
	await redis.zadd(PLAYING_KEY, endsAt, String(character.id));
	count('activity', 'plays_started');

	// Reflect the play on the community overlay (no-op if they have no live socket).
	void updatePresence(character.id, {
		status: STATUS.playing,
		nowPlaying: `${beatmap.artist} - ${beatmap.title}`,
	});

	// Every device of this character learns the play started (resume / spectate).
	hub.sendTo(character.id, {
		type: 'play:state', state: activeState(entry),
	});

	return {
		status: 'ranked',
		ruleset: r.def.id,
		joined: false,
		token,
		beatmapId,
		rate,
		mods,
		startedAt,
		endsAt: shownEnd(entry),
		serverNow: Date.now(),
		fatigue,
		warmup: warm,
		warmupBar: bar,
		warmupTrend: entry.strain && r.play.warmupTrend(entry.strain),
		...chunkFrom(entry, 0),
	};
}

/**
 * Obtain play data by deleting it so we can consume it without duplication
 */
const getAndDeletePlay = async(characterId: number): Promise<Pending | undefined> => {
	const result = await redis.eval(
		TAKE_PLAY,
		1, 
		playKey(characterId),
		String(characterId),
	) as string | undefined;
	if (!result) return;
	return {
		...BEFORE_RULESETS, ...JSON.parse(result) as Pending, 
	};
};

/** A play on an unranked map's leaderboard: onto the board, nothing else moves. Dropped
 *  when the map lost its board mid-play (updated, ranked or taken down). */
const parseUnrankedResult = async (
	r: ServerRuleset,
	play: Pending,
	notify: boolean,
): Promise<ParsedResult> => {
	if (!await hasUnrankedBoard(play.draft.beatmapId)) {
		return {
			token: play.token, failed: true, notify,
		};
	}
	play.draft.playedAt = new Date();
	const row = await recordUnrankedScore(r, play.draft);
	return {
		token: play.token,
		failed: false,
		score: scoreRowToDTO(r, row),
		gains: [],
		deltas: {
			rank: 0, rankedScore: 0, pp: 0,
		},
		notify,
	};
};

const parsePlayResult = async (play: Pending, notify: boolean): Promise<ParsedResult> => {
	// the character the play earns for: the session's own, or the one it played as
	const characterId = play.draft.characterId;
	const r = rulesetFor(play.ruleset);

	if (play.failedAt) {
		return {
			token: play.token,
			failed: true,
			notify,
			failProgress: play.failProgress,
			failSeconds: play.failSeconds,
		};
	}
	if (play.board === 'unranked') return parseUnrankedResult(r, play, notify);

	if (play.unranked) {
		return {
			token: play.token,
			failed: false,
			score: scoreRowToDTO(r, {
				...play.draft, id: 0,
			} as ScoreRow),
			gains: [],
			deltas: {
				rank: 0, rankedScore: 0, pp: 0,
			},
			notify,
		};
	}

	// Unranked mid-play (admin toggle): drop the result instead of resurrecting
	// a score for a map whose progression was just purged.
	const beatmap = await getLiveBeatmap(r, play.draft.beatmapId);
	if (!beatmap) {
		return {
			token: play.token,
			failed: true,
			notify,
		};
	}

	const before = await profileSnapshot(r, characterId);

	play.draft.playedAt = new Date();
	const row = await submitScore(r, play.draft);
	const gains = await applySkillXp(r, characterId, play.skillXp);
	if (play.strain) {
		await addFatigue(r, characterId, play.strain.minutes, play.strain.strained, Date.now());
	}
	await reindexCharacter(r, characterId);
	await reindexBeatmap(r, characterId, play.draft.beatmapId);

	const after = await profileSnapshot(r, characterId);
	const deltas: PlayDeltas = {
		// positive = climbed; unknown before/after (fresh index) counts as no move
		rank: before.rank !== undefined && after.rank !== undefined
			? before.rank - after.rank
			: 0,
		rankedScore: after.rankedScore - before.rankedScore,
		pp: Math.round((after.pp - before.pp) * 100) / 100,
	};

	return {
		token: play.token,
		failed: false,
		score: scoreRowToDTO(r, row),
		gains,
		deltas,
		notify,
	};
};

/** The profile metrics a play can move, read around a submit to compute the
 *  result-screen deltas. */
const profileSnapshot = async (r: ServerRuleset, characterId: number) => {
	const [profile, totals, rank] = await Promise.all([
		profileOf(r, characterId),
		getCharacterTotals(r, characterId),
		globalRank(r, 'pp', characterId),
	]);
	return {
		rankedScore: totals.rankedScore,
		pp: Number(profile.pp),
		rank,
	};
};

/**
 * Consumes a pending play to persist the score result.
 * @param serverSide True when finalised on the server's own clock (the sweep),
 *   not by a client reading its result. Only these are notifiable: a result a
 *   client already saw on its result screen must not re-surface from idle polls.
 */
export async function finalizePlay(
	characterId: number, 
	serverSide: boolean = false,
): Promise<StoredResult | undefined> {
	const play = await getAndDeletePlay(characterId);
	if (!play) return;

	// Free up the character slot for playing again
	await redis.zrem(PLAYING_KEY, String(characterId));

	// Back to idle on the community overlay (no-op without a live socket).
	void updatePresence(characterId, {
		status: STATUS.idle, nowPlaying: undefined,
	});

	const result: StoredResult = {
		...await parsePlayResult(play, serverSide), ruleset: play.ruleset, player: play.draft.characterId,
	};

	// The play is over, so anything it deferred runs now - after its xp landed,
	// and whether or not it landed any (a failed play and an unranked-mid-play
	// both return above without applying xp). The play record is already
	// consumed, so a throw here would lose the result and the state push with it.
	const live = await applyPendingAction(characterId).catch(e => {
		console.error('[play] pending actions failed for', characterId, e);
		return characterId;
	});

	await redis.set(resultKey(characterId), JSON.stringify(result), 'PX', RESULT_TTL_MS);

	// the xp this play paid and whatever it deferred, both landed: hand the
	// character over before the result, so every screen showing it is current
	await pushCharacter(live).catch(e =>
		console.error('[play] character push failed for', live, e));

	// Every device learns the play ended (clears banners, surfaces the result).
	hub.sendTo(characterId, {
		type: 'play:state',
		state: {
			phase: 'finished', token: result.token, notify: result.notify, failed: result.failed,
		},
	});

	const again = result.failed && retriesOnFail(modsOf(play)) ? {
		beatmapId: play.beatmapId, rate: rateOf(play),
	} : undefined;
	await playEnded(live, again).catch(e => console.error('[queue] chain failed for', live, e));

	count('activity', 'plays_finished');
	console.log(characterId, 'finished. playing users:', await getPlaying());
	return result;
}

const UnknownResult = {
	ok: false, reason: 'unknown',
} as const;
const CacheMissResult = {
	ok: false, reason: 'cache-miss',
} as const;
const UnfinalizedResult = {
	ok: false, reason: 'unfinalized',
} as const;
const TooSoonResult = {
	ok: false, reason: 'tooSoon',
} as const;
const ScoreResult = (result: StoredResult): PlayResult => ({
	ok: true,
	failed: result.failed,
	score: result.failed ? undefined : result.score,
	gains: result.failed ? undefined : result.gains,
	deltas: result.failed ? undefined : result.deltas,
});

/** The result as sent, with the medals it unlocked when the screen asking is
 *  about to show it (see awardMedals). */
const resultWithMedals = async (
	result: StoredResult,
	medals: boolean,
): Promise<PlayResult> => {
	const { ruleset, player: characterId } = result;
	const sent = ScoreResult(result);
	if (!medals || !sent.ok) return sent;
	const fail = result.failed ? {
		failedAt: result.failProgress, failedSeconds: result.failSeconds,
	} : {};
	const unlocked = await awardMedals(rulesetFor(ruleset), characterId, fail).catch(e => {
		console.error('[play] medals failed for', characterId, e);
		return undefined;
	});
	return {
		...sent, medals: unlocked?.ids ?? [], medalsHeld: unlocked?.held,
	};
};

export async function fetchResult(
	characterId: number,
	token: string,
	forceSee: boolean = false,
	medals: boolean = false,
): Promise<PlayResult> {

	const cached = await redis.get(resultKey(characterId));
	if (cached) {
		const result = {
			...BEFORE_RULESETS, player: characterId, ...JSON.parse(cached) as object,
		} as StoredResult;
		if (!result.notify && !forceSee) return CacheMissResult;
		else if (result.notify) {
			redis.set(resultKey(characterId), JSON.stringify({
				...result, notify: false, 
			}), 'KEEPTTL');
		}
		if (result.token === token) {
			return resultWithMedals(result, medals);
		}
	}

	const play = await readPlay(characterId);
	if (!play || play.token !== token) return UnknownResult;
	if (isProd && Date.now() < play.endsAt) return TooSoonResult;

	const result = (await finalizePlay(characterId));
	
	return result ? resultWithMedals(result, medals) : UnfinalizedResult;
}

/** Player quit: drop the play without submitting (token must match). Every
 *  device is told, so spectating tabs stop too. */
export async function abortPlay(characterId: number, token: string): Promise<{ ok: boolean }> {
	const raw = await redis.eval(
		ABORT_PLAY,
		1,
		playKey(characterId),
		String(characterId),
		token,
	) as string | null;
	if (raw) {
		await redis.zrem(PLAYING_KEY, String(characterId));
		// an abort ends the play without ever finalising it; without this the
		// action it deferred would stay parked forever - and a throw must not cost
		// the clients their abort notice
		const live = await applyPendingAction(characterId).catch(e => {
			console.error('[play] pending actions failed for', characterId, e);
			return characterId;
		});
		await pushCharacter(live).catch(e =>
			console.error('[play] character push failed for', live, e));
		hub.sendTo(characterId, {
			type: 'play:aborted', token,
		});
		await playEnded(live).catch(e => console.error('[queue] chain failed for', live, e));
	}
	return { ok: raw !== null };
}

/** Player skipped the lead-in: shift the play's timeline so it finalises earlier
 *  (token must match). */
export async function skipPlay(characterId: number, token: string): Promise<{ ok: boolean }> {
	const raw = await redis.eval(
		SKIP_PLAY, 2, playKey(characterId), PLAYING_KEY,
		String(characterId), token, String(Date.now()), String(LEAD_IN_MS),
	) as string | null;
	return { ok: raw !== null };
}

/** Debug: end the play now (see FINISH_PLAY). */
export async function finishPlayNow(characterId: number, token: string): Promise<{ ok: boolean }> {
	const raw = await redis.eval(
		FINISH_PLAY, 2, playKey(characterId), PLAYING_KEY,
		String(characterId), token, String(Date.now()),
	) as string | null;
	return { ok: raw !== null };
}

/** Stream the next slice of replay offsets, gated to the buffer window so the
 *  client never holds more than a few seconds of the play's future. Returns an
 *  empty done chunk for an unknown/foreign token (the play already finished). */
export async function streamOffsets(
	characterId: number,
	token: string,
	from: number,
): Promise<OffsetChunk> {
	const play = await readPlay(characterId);
	if (!play || play.token !== token) {
		return {
			offsets: [], next: from, done: true,
		};
	}
	return chunkFrom(play, from);
}

/** The live-play descriptor: score checkpoint at the live position (see
 *  `samples` in Pending) + timing; `serverNow` lets the client absorb clock
 *  skew. Primitives only - never spread the whole Pending (heavy offsets). */
const activeState = (play: Pending): Extract<PlayState, { phase: 'active' }> => {
	const pos = Date.now() - play.startedAt - LEAD_IN_MS;
	let accuracy: number | undefined;
	let grade: Grade | undefined;
	for (const [t, a, g] of play.samples ?? []) {
		if (t > pos) break;
		accuracy = a;
		grade = g;
	}
	return {
		phase: 'active',
		token: play.token,
		beatmapId: play.beatmapId,
		rate: rateOf(play),
		mods: modsOf(play),
		startedAt: play.startedAt,
		endsAt: shownEnd(play),
		serverNow: Date.now(),
		accuracy,
		grade,
	};
};

/** Current play state for resume-after-refresh / cross-tab spectating. */
export async function playState(characterId: number): Promise<PlayState> {
	const play = await readPlay(characterId);
	// While the play record exists it's still live (or overdue awaiting finalise).
	// Never finalise here: finalising would terminate the play out from under its
	// spectator, ejecting it before the result screen. An overdue play is
	// finalised server-side by the sweep (ephemeral result) or by the finishing
	// client itself via fetchResult.
	if (play) return activeState(play);
	const result = await redis.get(resultKey(characterId));
	if (result) {
		const stored = JSON.parse(result) as StoredResult;
		return {
			phase: 'finished', token: stored.token, notify: stored.notify,
		};
	}
	return { phase: 'idle' };
}

/** Finalise every play whose end time has passed, so abandoned plays still
 *  submit. Safe to run on every worker - the atomic claim guards single submit. */
export async function sweepDuePlays(): Promise<void> {
	const due = await redis.zrangebyscore(PLAYING_KEY, '-inf', Date.now() - RESULT_BREATH_TTL_MS);
	for (const id of due) {
		try {
			await finalizePlay(Number(id), true);
		} catch (e) {
			console.error('[play] sweep finalize failed for', id, e);
		}
	}
}

function scoreRowToDTO(r: ServerRuleset, row: ScoreRow): ScoreDTO {
	return {
		...toScoreDTO(row, r.def),
		playedAt: (row.playedAt ?? new Date()).getTime(),
	};
}

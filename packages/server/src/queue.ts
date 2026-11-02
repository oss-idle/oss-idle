import { eq } from 'drizzle-orm';

import { cleanMods } from '@oss-idle/shared/mods';
import {
	applyQueueEdit,
	AUTOPILOT_DELAY,
	AUTOPILOT_MODE,
	AWAY_HOURS,
	nextStart,
	type QueueEdit,
	type QueueEntry,
	type QueuePrefs,
	type QueueSource,
	type QueueState,
	rotateQueue,
	SUPPORTER_AWAY_HOURS,
} from '@oss-idle/shared/queue';

import { db } from './db/client';
import {
	type CharacterRow,
	characters,
	getCharacterById,
	profileOf,
} from './db/schema/character';
import {
	type UserRow,
	users,
} from './db/schema/user';
import {
	isPbe,
	redisKeyPrefix,
} from './env';
import {
	autoSkipOf,
	setAutoSkip,
} from './pbe/autoSkip';
import {
	abortPlay,
	finalizePlay,
	finishPlayNow,
	isPlaying,
	playState,
	startPlay,
} from './play';
import {
	redis,
	withLock,
} from './redis';
import { rulesetFor } from './rulesets/registry';
import {
	characterOfSlot,
	parseSlot,
	type Slot,
} from './slot';
import { isSupporter } from './supporter';
import { hub } from './ws/hub';
import { ownMatch } from './ws/multiplayer';
import {
	hasClient,
	isListed,
	leave,
	presenceCount,
	touch,
} from './ws/presence';

/**
 * A slot's play queue - one character in one ruleset - chained by the server
 * whether a game is open or not (spec/queue.md §9). A play's end schedules the
 * head at `nextAt`; the sweep starts it. A head the server can't rank is offered
 * to a client watching the slot, which plays it locally and says for how long.
 * With none watching ("away": the game closed, or the account watching another
 * slot), those are skipped. Every slot of an account plays on while one of its
 * games is open; once all are closed, each logs off when its window ends or
 * nothing is left to play.
 */

type Stored = QueueSource & {
	entries: QueueEntry[];
	paused: boolean;
	nextAt?: number;
	remaining?: number;
	/** an unranked head waiting for a client to claim it */
	offer?: { serial: number; entry: QueueEntry };
	/** a client is running a local play until then */
	localUntil?: number;
	/** SD / PF: the map that just failed, played again before the queue moves on */
	again?: QueueEntry;
	/** a client's result screen: nothing starts before then */
	holdUntil?: number;
	failures?: number;
};

const EMPTY: Stored = {
	label: '', entries: [], paused: false,
};

const queueKey = (slot: Slot) => `${redisKeyPrefix}queue:${slot}`;
const lockKey = (slot: Slot) => `${redisKeyPrefix}queue:lock:${slot}`;
/** slot -> nextAt */
const DUE = `${redisKeyPrefix}queue:due`;
/** slot -> when its window ends */
const AWAY = `${redisKeyPrefix}away`;

/** Long enough for a client to load a map and say it started. */
const OFFER_MS = 15_000;
const CLAIM_MS = 60_000;
const RETRY_MS = 2000;
const MAX_FAILURES = 3;

const read = async (slot: Slot): Promise<Stored> => {
	const raw = await redis.get(queueKey(slot));
	return raw ? JSON.parse(raw) as Stored : { ...EMPTY };
};

/** The rate and mods the slot plays at: its ruleset's own. */
const playPrefs = async (slot: Slot): Promise<Pick<QueuePrefs, 'rate' | 'mods'>> => {
	const { characterId, ruleset } = parseSlot(slot);
	const profile = await profileOf(rulesetFor(ruleset), characterId);
	return {
		rate: profile.playRate, mods: profile.playMods ?? [],
	};
};

const prefsOf = async (slot: Slot, row: CharacterRow, user: UserRow): Promise<QueuePrefs> => ({
	mode: row.autopilotMode,
	delay: row.autopilotDelay,
	...await playPrefs(slot),
	keepPlaying: user.keepPlaying,
	...isPbe && { autoSkip: await autoSkipOf(row.id) },
});

const userOf = async (row: CharacterRow): Promise<UserRow | undefined> =>
	(await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];

const disabled = (row: CharacterRow) => row.autopilotMode === AUTOPILOT_MODE.DISABLED;

const toDTO = async (
	slot: Slot, s: Stored, row: CharacterRow, user: UserRow,
): Promise<QueueState> => ({
	label: s.label,
	mode: s.mode,
	groupKey: s.groupKey,
	entries: s.entries,
	paused: s.paused || disabled(row),
	nextAt: s.nextAt,
	remaining: s.remaining,
	prefs: await prefsOf(slot, row, user),
	serverNow: Date.now(),
});

export const queueState = async (slot: Slot): Promise<QueueState | undefined> => {
	const row = await getCharacterById(characterOfSlot(slot));
	const user = row && await userOf(row);
	return user && toDTO(slot, await read(slot), row, user);
};

const push = async (slot: Slot): Promise<void> => {
	const state = await queueState(slot);
	if (state) {
		hub.sendTo(slot, {
			type: 'queue:state', state,
		});
	}
};

const save = async (slot: Slot, s: Stored): Promise<void> => {
	const tx = redis.multi().set(queueKey(slot), JSON.stringify(s));
	if (s.nextAt === undefined) tx.zrem(DUE, slot);
	else tx.zadd(DUE, s.nextAt, slot);
	await tx.exec();
};

/** Change the queue under its lock, then show every device. */
const change = async (slot: Slot, fn: (s: Stored) => void): Promise<Stored> => {
	const s = await withLock(lockKey(slot), async () => {
		const s = await read(slot);
		fn(s);
		await save(slot, s);
		return s;
	});
	await push(slot);
	return s;
};

const MIN_DELAY = isPbe ? AUTOPILOT_DELAY.pbeMin : AUTOPILOT_DELAY.min;

const delayMs = (row: CharacterRow) => row.autopilotDelay * 1000;

/** Schedule the head, unless something holds the queue. */
const schedule = (s: Stored, row: CharacterRow, ms: number): void => {
	const at = nextStart(s, row.autopilotMode, Date.now(), ms);
	s.nextAt = at === undefined ? undefined : Math.max(at, s.holdUntil ?? 0);
};

const rotate = (s: Stored, played: QueueEntry): void => {
	s.entries = rotateQueue(s.entries, played);
};

// --- client edits ---------------------------------------------------------

const emptied = (s: Stored): void => {
	if (s.entries.length) return;
	s.nextAt = undefined;
	s.remaining = undefined;
};

export const setEntries = (
	slot: Slot, source: QueueSource, entries: QueueEntry[],
) => change(slot, s => {
	s.label = source.label;
	s.mode = source.mode;
	s.groupKey = source.groupKey;
	s.entries = entries;
	// built as a map launches: the launched play's end is what schedules
	s.nextAt = undefined;
	s.remaining = undefined;
});

export const editQueue = (slot: Slot, edit: QueueEdit) => change(slot, s => {
	// adding to nothing starts a new queue
	if ((edit.op === 'append' || edit.op === 'playNext') && !s.entries.length) {
		s.label = edit.label ?? '';
		s.mode = undefined;
		s.groupKey = undefined;
	}
	s.entries = applyQueueEdit(s.entries, edit);
	emptied(s);
});

const busy = async (slot: Slot, s: Stored) =>
	await isPlaying(slot) || (s.localUntil ?? 0) > Date.now();

export const pauseQueue = async (slot: Slot, paused: boolean): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	const running = await busy(slot, await read(slot));
	await change(slot, s => {
		if (paused) {
			s.remaining = s.nextAt === undefined ? s.remaining : Math.max(0, s.nextAt - Date.now());
			s.paused = true;
			s.nextAt = undefined;
			return;
		}
		if (disabled(row)) return;
		s.paused = false;
		// a running play's end schedules the next one
		if (!running && s.nextAt === undefined) schedule(s, row, s.remaining ?? delayMs(row));
		s.remaining = undefined;
	});
};

export const startQueue = async (slot: Slot): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row || disabled(row)) return;
	await change(slot, s => {
		s.paused = false;
		s.remaining = undefined;
		s.holdUntil = undefined;
		schedule(s, row, 0);
	});
};

/** Drop the running play and start the head now. */
export const skipQueue = async (slot: Slot): Promise<void> => {
	const state = await playState(slot);
	// the abort schedules the next one with the delay; this brings it forward
	if (state.phase === 'active') await abortPlay(slot, state.token);
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	await change(slot, s => {
		s.localUntil = undefined;
		s.holdUntil = undefined;
		schedule(s, row, 0);
	});
};

export const setPrefs = async (slot: Slot, prefs: Partial<QueuePrefs>): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	const { characterId, ruleset } = parseSlot(slot);
	const own = {
		autopilotMode: prefs.mode,
		autopilotDelay: prefs.delay && Math.max(prefs.delay, MIN_DELAY),
	};
	if (Object.values(own).some(v => v !== undefined)) {
		await db.update(characters).set(own).where(eq(characters.id, characterId));
	}
	const play = {
		playRate: prefs.rate, playMods: prefs.mods && cleanMods(prefs.mods),
	};
	if (Object.values(play).some(v => v !== undefined)) {
		const r = rulesetFor(ruleset);
		// a ruleset never played has no row yet
		await profileOf(r, characterId);
		await db.update(r.profile).set(play).where(eq(r.profile.id, characterId));
	}
	if (prefs.keepPlaying !== undefined) {
		await db.update(users).set({ keepPlaying: prefs.keepPlaying }).where(eq(users.id, row.userId));
	}
	if (prefs.autoSkip !== undefined) await setAutoSkip(characterId, prefs.autoSkip);
	if (prefs.mode === AUTOPILOT_MODE.DISABLED) {
		await pauseQueue(slot, true);
		return;
	}
	await push(slot);
};

export const claimOffer = async (slot: Slot, serial: number): Promise<boolean> => {
	let ok = false;
	await change(slot, s => {
		if (s.offer?.serial !== serial) return;
		ok = true;
		rotate(s, s.offer.entry);
		s.offer = undefined;
		s.failures = 0;
		// if the client never says it started, carry on without it
		s.localUntil = Date.now() + CLAIM_MS;
		s.nextAt = s.localUntil;
	});
	return ok;
};

export const localStart = async (slot: Slot, ms: number): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	await change(slot, s => {
		s.localUntil = Date.now() + ms;
		schedule(s, row, ms + delayMs(row));
	});
};

/** The result screen just opened: the countdown starts over from now, and is
 *  never cut shorter than it already was. */
export const holdQueue = (slot: Slot, ms: number) => change(slot, s => {
	s.holdUntil = Date.now() + ms;
	if (s.nextAt !== undefined) s.nextAt = Math.max(s.nextAt, s.holdUntil);
});

export const localEnd = async (slot: Slot, skip: boolean): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	await change(slot, s => {
		s.localUntil = undefined;
		if (skip) s.holdUntil = undefined;
		schedule(s, row, skip ? 0 : delayMs(row));
	});
};

// --- the chain ------------------------------------------------------------

/** A ranked play just ended (finalised or aborted): the next one follows, or
 *  `again` (an SD / PF fail) right away. */
export const playEnded = async (slot: Slot, again?: QueueEntry): Promise<void> => {
	// a match round ends into the match, not into the queue
	if (await ownMatch(characterOfSlot(slot))) return;
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	const held = await read(slot);
	if (again && !held.paused && !disabled(row)) {
		await change(slot, s => {
			s.again = again;
			s.nextAt = Date.now();
		});
		return;
	}
	// a character that never had a queue has nothing to chain, nor to be told
	if (!await redis.exists(queueKey(slot))) return;
	const s = await change(slot, s => schedule(s, row, delayMs(row)));
	if (s.nextAt === undefined && await isAway(slot)) await logOff(slot);
};

const stop = async (slot: Slot, reason: 'failed' | 'restricted' | 'inMatch'): Promise<void> => {
	await change(slot, s => {
		s.paused = true;
		s.nextAt = undefined;
		s.failures = 0;
	});
	hub.sendTo(slot, {
		type: 'queue:stopped', reason,
	});
};

const offer = async (slot: Slot, entry: QueueEntry): Promise<void> => {
	const serial = Date.now();
	await change(slot, s => {
		s.offer = {
			serial, entry,
		};
		s.nextAt = serial + OFFER_MS;
	});
	hub.sendTo(slot, {
		type: 'queue:offer', serial, entry,
	});
};

/** A start that did not happen tries again shortly; three in a row pause the queue. */
const startFailed = async (slot: Slot): Promise<void> => {
	const s = await change(slot, s => {
		s.failures = (s.failures ?? 0) + 1;
		s.nextAt = Date.now() + RETRY_MS;
	});
	if ((s.failures ?? 0) >= MAX_FAILURES) await stop(slot, 'failed');
};

/** What happened trying to start the head. `next` means try the one after it now. */
const tryHead = async (
	slot: Slot, row: CharacterRow, head: QueueEntry, away: boolean,
): Promise<'done' | 'next'> => {
	// a seated player's only play is the round's
	if (await ownMatch(characterOfSlot(slot))) {
		await stop(slot, 'inMatch');
		return 'done';
	}
	const prefs = await playPrefs(slot);
	const result = await startPlay(slot, row, head.beatmapId, {
		rate: head.rate ?? prefs.rate, mods: head.mods ?? prefs.mods,
	});
	switch (result.status) {
		case 'ranked':
			if (!result.joined) {
				await change(slot, s => {
					rotate(s, head);
					s.failures = 0;
				});
			}
			return 'done';
		case 'unranked':
			if (!away) {
				await offer(slot, head);
				return 'done';
			}
			await change(slot, s => rotate(s, head));
			return 'next';
		case 'refused':
			await startFailed(slot);
			return 'done';
		case 'restricted':
			hub.sendTo(slot, {
				type: 'queue:stopped', reason: 'restricted',
			});
			await logOff(slot);
			return 'done';
	}
};

/** Play a failed SD / PF map again. */
const retry = async (slot: Slot, row: CharacterRow, again: QueueEntry): Promise<boolean> => {
	await change(slot, s => void (s.again = undefined));
	// a round's fail is the match's business
	if (await ownMatch(characterOfSlot(slot))) return true;
	const prefs = await playPrefs(slot);
	const result = await startPlay(slot, row, again.beatmapId, {
		rate: again.rate ?? prefs.rate, mods: again.mods ?? prefs.mods,
	});
	return result.status === 'ranked';
};

/** Nobody took the unranked head: play on without it. */
const dropOffer = async (slot: Slot, s: Stored): Promise<Stored> => {
	if (!s.offer) return s;
	const skipped = s.offer.entry;
	return change(slot, s => {
		rotate(s, skipped);
		s.offer = undefined;
	});
};

/** Walk the queue from its head until something starts. With the game closed,
 *  what can't start here is skipped, and nothing left to play logs off. */
const startFromHead = async (slot: Slot, row: CharacterRow, away: boolean): Promise<void> => {
	let s = await read(slot);
	const tries = s.entries.length;
	for (let i = 0; i < tries; i++) {
		const head = s.entries[0];
		if (!head || s.paused || disabled(row)) break;
		if (await tryHead(slot, row, head, away) === 'done') return;
		s = await read(slot);
	}
	if (away) await logOff(slot);
};

/** PBE: with the game closed the server ends the running play itself, as an open game does. */
const autoSkipAway = async (slot: Slot): Promise<void> => {
	const characterId = characterOfSlot(slot);
	if (!await autoSkipOf(characterId) || await ownMatch(characterId)) return;
	const state = await playState(slot);
	if (state.phase !== 'active') return;
	const { ok } = await finishPlayNow(slot, state.token);
	if (ok) await finalizePlay(slot, true);
};

/** Start the head of the queue (or the SD / PF retry before it). */
const runNext = async (slot: Slot): Promise<void> => {
	const row = await getCharacterById(characterOfSlot(slot));
	if (!row) return;
	const away = await isAway(slot);
	// nobody connected and no closed-game window: there is no one to play for
	if (!away && !await isListed(slot)) {
		await halt(slot);
		return;
	}
	const s = await dropOffer(slot, await read(slot));
	if (await busy(slot, s)) {
		// a client already started the retry itself
		if (s.again) await change(slot, s => void (s.again = undefined));
		return;
	}
	const retrying = s.again && !s.paused && !disabled(row);
	const retried = retrying && await retry(slot, row, s.again!);
	if (!retried) await startFromHead(slot, row, away);
	if (away) await autoSkipAway(slot);
};

/** One sweep at a time per worker: a start simulates a whole map, and a sweep
 *  firing again meanwhile would pile more of them onto the same event loop. */
let sweeping = false;

/** Start every queue whose head is due. Safe on every worker: the ZREM claims. */
export const sweepQueues = async (): Promise<void> => {
	if (sweeping) return;
	sweeping = true;
	try {
		const due = await redis.zrangebyscore(DUE, '-inf', Date.now()) as Slot[];
		for (const slot of due) {
			if (await redis.zrem(DUE, slot) !== 1) continue;
			await runDue(slot);
		}
	} finally {
		sweeping = false;
	}
};

const runDue = async (slot: Slot): Promise<void> => {
	try {
		await change(slot, s => {
			s.nextAt = undefined;
		});
		await runNext(slot);
	} catch (e) {
		console.error('[queue] next failed for', slot, e);
		await startFailed(slot).catch(() => undefined);
	}
};

// --- away -----------------------------------------------------------------

export const isAway = async (slot: Slot): Promise<boolean> =>
	await redis.zscore(AWAY, slot) !== null;

/** Players with a game open: the roster minus characters playing with theirs closed. */
export const clientCount = async (): Promise<number> =>
	Math.max(0, await presenceCount() - await redis.zcard(AWAY));

/** Whether the slot would play on with nobody watching it: something queued,
 *  nothing holding it, and a game of the account still open or the option on. */
const playsOn = async (slot: Slot): Promise<UserRow | undefined> => {
	const row = await getCharacterById(characterOfSlot(slot));
	const user = row && await userOf(row);
	if (!row || !user || user.restrictedAt) return undefined;
	if (!user.keepPlaying && !await hasClient(user.id)) return undefined;
	const s = await read(slot);
	return s.paused || disabled(row) || !s.entries.length ? undefined : user;
};

const windowEnd = async (user: UserRow): Promise<number> =>
	Date.now() + (await isSupporter(user.id) ? SUPPORTER_AWAY_HOURS : AWAY_HOURS) * 3600_000;

export const goAway = async (slot: Slot): Promise<boolean> => {
	const user = await playsOn(slot);
	if (!user) return false;
	const s = await read(slot);
	await redis.zadd(AWAY, await windowEnd(user), slot);
	// the local play the closed client was running died with it
	if (s.offer || s.localUntil !== undefined) {
		await change(slot, s => {
			s.localUntil = undefined;
			s.nextAt = Date.now();
		});
	}
	await autoSkipAway(slot).catch(e => console.error('[queue] auto-skip failed for', slot, e));
	return true;
};

/**
 * A socket closed. That alone says nothing about the game being closed: a
 * reconnect follows a deploy or a dropped connection within seconds, and another
 * tab may hold a socket on another worker. So a character that would play on
 * stays as it is, and the presence sweep decides, once no client has been heard
 * from for its TTL. Anyone else goes offline now, as before.
 */
export const socketClosed = async (slot: Slot): Promise<void> => {
	const s = await read(slot).catch(() => undefined);
	// a queue that would run: the presence sweep decides, either way
	if (s && !s.paused && s.entries.length) return;
	await leave(slot);
};

/** Nothing more starts: the queue stays as it is, with nothing scheduled. */
const halt = (slot: Slot) => change(slot, s => {
	s.nextAt = undefined;
	s.offer = undefined;
	s.again = undefined;
	s.localUntil = undefined;
});

/** No client of the character has been heard from: it keeps playing with the
 *  game closed, or goes offline. */
export const leaveOrPlayOn = async (slot: Slot): Promise<void> => {
	const playing = await goAway(slot).catch(e => {
		console.error('[queue] away failed for', slot, e);
		return false;
	});
	if (playing) return;
	if (await redis.exists(queueKey(slot))) await halt(slot);
	await leave(slot);
};

/** A client is connected again. */
export const comeBack = (slot: Slot): Promise<number> => redis.zrem(AWAY, slot);

/** The character stops playing for good: the queue is cleared. */
export const logOff = async (slot: Slot): Promise<void> => {
	// under the queue's lock, or a change in flight would write it back
	await withLock(lockKey(slot), () => redis.multi()
		.zrem(AWAY, slot)
		.zrem(DUE, slot)
		.del(queueKey(slot))
		.exec());
	if (!hub.isLocal(slot)) await leave(slot);
};

/** Keep away slots on the roster. While a game of the account is open their window
 *  starts over, so it runs from when the last one closed; with every game closed and
 *  the option off they stop, and the rest log off once their window ended. */
export const sweepAway = async (): Promise<void> => {
	const now = Date.now();
	const away = await redis.zrange(AWAY, 0, -1, 'WITHSCORES');
	for (let i = 0; i < away.length; i += 2) {
		const slot = away[i] as Slot;
		const row = await getCharacterById(characterOfSlot(slot));
		const user = row && await userOf(row);
		if (user && await hasClient(user.id)) {
			await redis.zadd(AWAY, 'XX', await windowEnd(user), slot);
			await touch(slot);
		} else if (user && !user.keepPlaying) {
			if (await redis.zrem(AWAY, slot) === 1) await leaveOrPlayOn(slot);
		} else if (Number(away[i + 1]) <= now) {
			if (await redis.zrem(AWAY, slot) === 1) await logOff(slot);
		} else {
			await touch(slot);
		}
	}
};

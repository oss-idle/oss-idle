import {
	ph,
	t,
} from '@lingui/core/macro';

import { CONTACT_EMAIL } from '@oss-idle/shared/contact';
import Synced from '@oss-idle/shared/helpers/synced';
import type { Mod } from '@oss-idle/shared/mods';
import type {
	PlayState,
	StrainSamples,
} from '@oss-idle/shared/play';
import type { ReplayOffset } from '@oss-idle/shared/rulesets/mania/maniaGame';

import type Character from '../db/schema/character';
import { selectedMods } from '../gameplay/playMods';
import { rateFor } from '../gameplay/playRate';
import { showDeltas } from '../globals';
import { debugXpMultiplier } from '../globals';
import { maniaOffsets } from '../rulesets/mania/wire';
import type { Tiredness } from './localPlay';
import Socket from './socket';

/** Generous: a start awaits the server-side simulation of the whole map. */
const START_TIMEOUT_MS = 20_000;
const RESULT_TIMEOUT_MS = 10_000;

export type RankedPlayContext = {
	mode: 'ranked';
	token: string;
	/** what the server is actually playing - a join can differ from the request */
	beatmapId: number;
	/** the playback rate the server simulated it at */
	rate: number;
	mods: Mod[];
	/** the offsets revealed so far; the rest are pushed while `play:watch`ed */
	offsets: ReplayOffset[];
	/** resume cursor + whether every offset has already been delivered */
	next: number;
	done: boolean;
	/** the strain gauges up to the last offset revealed; the rest come with the offsets */
	strains?: StrainSamples;
	startedAt: number;
	endsAt: number;
	/** how tired the character plays it, 0 rested to 1 exhausted */
	fatigue: number;
	/** how warmed up, 0 cold to 1 warm */
	warmup: number;
	/** where on the warm-up bar, 0 cold to 1 exhausted */
	warmupBar?: number;
	/** which way the map moves the warm-up bar, -3 cooling to 3 warming */
	warmupTrend?: number;
};

/** A play this client resolved and is running itself (guest, or a map the
 *  server won't rank). Shaped like the ranked one on purpose: the scene treats
 *  both as a replay of a play that already happened. */
export type LocalPlayContext = {
	mode: 'guest' | 'unranked';
	token: string;
	beatmapId: number;
	rate: number;
	mods: Mod[];
	offsets: ReplayOffset[];
	startedAt: number;
	endsAt: number;
	/** unranked: as tired as the server said the character was */
	fatigue?: number;
	warmup?: number;
	warmupBar?: number;
};

/**
 * How a launched play is scored:
 *  - `guest`    - not signed in: resolved + scored by the local session, awards
 *                 local XP. Runs on its own clock, watched or not.
 *  - `unranked` - signed in but the map isn't ranked, or NF is on: same local
 *                 session, local score only, no XP, not submitted.
 *  - `ranked`   - signed in + map on the server: the server simulated it and is
 *                 authoritative. The client replays the offsets seeked to the
 *                 play's live position (`startedAt`) and fetches the result on
 *                 finish; the server finalises on its own clock regardless.
 *  - `debug`    - dev only: no-fail, never saved or submitted. From the strain
 *                 debug view, the server's whole replay of the debug bot and
 *                 its gauges; from the editor, a local bot.
 */
export type PlayContext =
	| { mode: 'debug', offsets?: ReplayOffset[], strains?: StrainSamples }
	| LocalPlayContext
	| RankedPlayContext;

/**
 * What a launch resolved to, before anything is running: a ranked play the
 *  server has already started, or the kind of local play to start here.
 *
 * `refused` isn't a way to start a play - the server declined to rank an
 * otherwise-rankable one (anti-cheat lock / server error); the caller turns it
 * into a dialog and, if the player accepts, retries as an `unranked` local play.
 */
export type PlaySession =
	| { mode: 'guest' }
	| { mode: 'unranked', tired?: Tiredness }
	| { mode: 'refused' }
	// the account is restricted: no play at all
	| { mode: 'restricted' }
	// seated in a match: only its rounds
	| { mode: 'inMatch' }
	| RankedPlayContext;

/**
 * The character's server-side play state, pushed over the socket: on connect,
 * on every play start/finish/abort, and live while a state watch is armed.
 * Undefined while disconnected.
 */
export const playState = new Synced<PlayState | undefined>(undefined);
Socket.on('play:state', msg => void playState.set(msg.state));
Socket.on('play:aborted', msg => clearActivePlayState(msg.token));
void Socket.connected.sync(open => {
	if (!open) void playState.set(undefined);
});

/** An aborted play leaves no record and no result: drop the (now stale) active
 *  state so song select doesn't spectate-relaunch it - which would start a
 *  fresh play - or keep showing its banner. */
const clearActivePlayState = (token: string) => {
	const state = playState.get();
	if (state?.phase === 'active' && state.token === token) {
		void playState.set({ phase: 'idle' });
	}
};

/** What a restricted player is told when a play won't start. */
export const restrictedMessage = () =>
	t`Your account is restricted, so you can't play. Write to ${ph({ email: CONTACT_EMAIL })} if you think it's a mistake.`
;

/** What a player seated in a match is told when a solo play won't start. */
export const inMatchMessage = () => t`Leave the match to play on your own.`;

/** Decide (and, when ranked, start or join) how a play should be scored. */
export async function startPlaySession(
	character: Character,
	beatmapId: number,
	lockedRate?: number,
	lockedMods?: Mod[],
): Promise<PlaySession> {
	if (character.isGuest()) return { mode: 'guest' };
	try {
		const sentAt = Date.now();
		const res = await Socket.request(
			{
				type: 'play:start',
				beatmapId,
				xpMultiplier: debugXpMultiplier.get(),
				rate: rateFor(character, lockedRate),
				mods: lockedMods ?? selectedMods.get(),
			},
			'play:start',
			START_TIMEOUT_MS,
		);
		const play = res.result;
		if (play.status === 'ranked') {
			// startedAt/endsAt are server-clock ms; the player's clock can differ by
			// seconds. Estimate the server clock at round-trip midpoint and shift the
			// timestamps into our own clock, so anchoring with our Date.now() is exact.
			const skew = (sentAt + Date.now()) / 2 - play.serverNow;
			return {
				mode: 'ranked',
				token: play.token,
				beatmapId: play.beatmapId,
				rate: play.rate,
				mods: play.mods,
				offsets: maniaOffsets(play.offsets),
				next: play.next,
				done: play.done,
				strains: play.strains,
				startedAt: play.startedAt + skew,
				endsAt: play.endsAt + skew,
				fatigue: play.fatigue,
				warmup: play.warmup,
				warmupBar: play.warmupBar,
				warmupTrend: play.warmupTrend,
			};
		}
		if (play.status === 'restricted') return { mode: 'restricted' };
		if (play.status === 'inMatch') return { mode: 'inMatch' };
		if (play.status === 'refused') return { mode: 'refused' };
		return {
			mode: 'unranked',
			tired: {
				fatigue: play.fatigue, warmup: play.warmup, warmupBar: play.warmupBar,
			},
		};
	} catch {
		// no connection / timeout: surface it so the player can retry instead of
		// unknowingly playing unranked
		return { mode: 'refused' };
	}
}

/** Thrown by {@link fetchPlayResult} when the server has no result to give,
 *  carrying its reason so the caller can branch (`unknown` = gone server-side). */
export class PlayResultError extends Error {
	constructor(public readonly reason: 'unknown' | 'cache-miss' | 'unfinalized' | 'tooSoon') {
		super(`play result failed (${reason})`);
		this.name = 'PlayResultError';
	}
}

/** Try to get an already finalized play if not already read */
export async function fetchPlayResult(
	token: string,
	forceSee: boolean = false,
	/** the result screen will show it: the server awards its medals */
	medals: boolean = false,
) {
	const res = await Socket.request(
		{
			type: 'play:result', token, forceSee, medals,
		},
		'play:result',
		RESULT_TIMEOUT_MS,
		msg => msg.token === token,
	);
	if (!res.result.ok) throw new PlayResultError(res.result.reason);
	// a freshly received score: float its profile movement, wherever we are
	if (res.result.deltas) showDeltas(res.result.deltas);
	const { medals: ids, medalsHeld, ...result } = res.result;
	return {
		...result,
		medals: ids && {
			ids, held: medalsHeld ?? ids.length,
		},
	};
}

/** Tell the server the player skipped the lead-in so its timeline moves forward
 *  with the client (otherwise the play finalises late). */
export async function skipPlaySession(token: string) {
	if (!(await Socket.sendSoon({
		type: 'play:skip', token,
	}))) console.warn('[play] skip not delivered');
}

/** Debug: ask the server to end the play now so its authoritative result can be
 *  read immediately. Ignored by a production server. */
export async function finishPlaySession(token: string, next: number) {
	if (!(await Socket.sendSoon({
		type: 'play:finish', token, next,
	}))) console.warn('[play] finish not delivered');
}

/** Quit: tell the server to drop the play without submitting. */
export async function abortPlaySession(token: string) {
	// optimistic: the scene lands back on song select before the server's
	// `play:aborted` returns, and the stale active state must not act there
	clearActivePlayState(token);
	if (!(await Socket.sendSoon({
		type: 'play:abort', token,
	}))) console.warn('[play] abort not delivered');
}

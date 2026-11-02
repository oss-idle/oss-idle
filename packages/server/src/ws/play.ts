import type { WSContext } from 'hono/ws';

import type { ClientMessage } from '@oss-idle/shared/community/wire';
import type {
	PlayResult,
	PlayStartResult,
} from '@oss-idle/shared/play';

import type { CharacterRow } from '../db/schema/character';
import {
	isPbe,
	isProd,
} from '../env';
import {
	abortPlay,
	fetchResult,
	finalizePlay,
	finishPlayNow,
	isPlaying,
	type PlayOptions,
	playState,
	skipPlay,
	startPlay,
	streamOffsets,
} from '../play';
import type { Slot } from '../slot';
import { hub } from './hub';
import { ownMatch } from './multiplayer';

/**
 * The play consumer of the community socket. Commands (start/skip/abort/result)
 * call straight into the play core, which pushes state changes to every one of
 * the character's sockets itself; the {@link PlayFeed} covers the one thing no
 * event fires for - time-based reveals - by polling Redis for the socket that
 * asked to watch.
 */

/** Feed cadence. Offsets stay well under the server's reveal buffer so a
 *  replaying client never out-runs its data. */
const FEED_TICK_MS = 1500;

/** One socket's play feed - at most one watch at a time. With a cursor it
 *  streams replay offsets (gameplay); without one it pushes live state
 *  checkpoints (the song-select resume banner). Stops itself once the play is
 *  fully delivered or no longer live. */
export class PlayFeed {

	private timer?: ReturnType<typeof setInterval>;
	private token?: string;
	private next?: number;
	private lastState?: string;
	private ticking = false;

	constructor(
		/** read per use: the hub says which slot the socket watches */
		private readonly slot: () => Slot,
		private readonly ws: WSContext,
	) {}

	public watch(token: string, next?: number): void {
		this.stop();
		this.token = token;
		this.next = next;
		this.lastState = undefined;
		this.timer = setInterval(() => void this.tick(), FEED_TICK_MS);
		void this.tick();
	}

	public stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}

	private async tick(): Promise<void> {
		const token = this.token;
		if (this.ticking || !token) return; // a slow Redis read must not stack ticks
		this.ticking = true;
		try {
			if (this.next !== undefined) await this.streamTick(token);
			else await this.stateTick(token);
		} catch (e) {
			console.error('[play] feed tick failed for', this.slot(), e);
		} finally {
			this.ticking = false;
		}
	}

	/** Push the offsets revealed since the cursor; a final (possibly empty) done
	 *  chunk closes the stream client-side. */
	private async streamTick(token: string): Promise<void> {
		const chunk = await streamOffsets(this.slot(), token, this.next!);
		if (chunk.offsets.length || chunk.done) {
			hub.sendLocal(this.ws, {
				type: 'play:offsets', token, ...chunk,
			});
		}
		this.next = chunk.next;
		if (chunk.done) this.stop();
	}

	/** Push the play state whenever its checkpoint moves; the terminal state
	 *  (finished/idle/another play) is pushed once, then the feed stops. */
	private async stateTick(token: string): Promise<void> {
		const state = await playState(this.slot());
		const live = state.phase === 'active' && state.token === token;
		const key = state.phase === 'active'
			? `${state.token}:${state.accuracy}:${state.grade}`
			: state.phase;
		if (key !== this.lastState) {
			this.lastState = key;
			hub.sendLocal(this.ws, {
				type: 'play:state', state,
			});
		}
		if (!live) this.stop();
	}

}

type PlaySession = {
	character: CharacterRow,
	/** the slot the socket watches */
	slot: Slot,
	ws: WSContext,
	feed: PlayFeed,
	/** re-reads the slot's character row - its skills level up between plays, and
	 *  the authoritative simulation must run on the current state, not the row
	 *  resolved when the socket connected */
	freshCharacter: () => Promise<CharacterRow | undefined>,
};

/** Handle one play-scoped message. Returns false for anything else. */
/** Answer a result request, whatever happens. The reply is sent after an await,
 *  so a throw in here used to send nothing at all and the client retried into
 *  silence until it gave up - a server fault reaching the player as a hang. */
const answerResult = async (
	ws: WSContext,
	slot: Slot,
	{
		token, forceSee = false, medals = false,
	}: Extract<ClientMessage, { type: 'play:result' }>,
): Promise<void> => {
	let result: PlayResult;
	try {
		result = await fetchResult(slot, token, forceSee, medals);
	} catch (e) {
		console.error('[play] result failed for', slot, e);
		result = {
			ok: false, reason: 'unfinalized',
		};
	}
	hub.sendLocal(ws, {
		type: 'play:result', token, result,
	});
};

/** A seated player's only play is the round's, which already exists when they join it. */
const startUnlessSeated = async (
	slot: Slot, character: CharacterRow, beatmapId: number, options: PlayOptions,
): Promise<PlayStartResult> => await ownMatch(character.id) && !await isPlaying(slot)
	? { status: 'inMatch' }
	: startPlay(slot, character, beatmapId, options);

const finishPlay = async (
	msg: Extract<ClientMessage, { type: 'play:finish' }>,
	slot: Slot,
	ws: WSContext,
): Promise<void> => {
	// a debug affordance: on prod it would hand out a play's xp without
	// spending the time the idle loop is built on
	if (isProd && !isPbe) return;
	// ending the play opens the whole remainder to the horizon gate, so the
	// rest of the replay can be answered right here - the client must not be
	// left waiting on the periodic feed to notice
	const { ok } = await finishPlayNow(slot, msg.token);
	if (msg.away) {
		if (ok) await finalizePlay(slot, true);
		return;
	}
	// read the rest of the replay out before finalising - finalising
	// consumes the play record
	const rest = await streamOffsets(slot, msg.token, msg.next);
	// `done` from the horizon gate answers "is the map fully revealed", which
	// a failed play never satisfies: its timeline stops where the bot died, so
	// the offsets past that point are never released. The play is over either
	// way, so nothing more is coming - say so, or the client waits forever.
	// Do not finalise here. finalizePlay consumes the play record, so a
	// finalise racing the client's own play:result leaves that read with
	// nothing to find - it reports unknown and retries while the first one
	// is still storing, which reads as the client hanging on "submitting".
	hub.sendLocal(ws, {
		type: 'play:offsets', token: msg.token, ...rest, done: true,
	});
};

export const handlePlay = async (
	msg: ClientMessage,
	{
		character, slot, ws, feed, freshCharacter,
	}: PlaySession,
): Promise<boolean> => {
	switch (msg.type) {
		case 'play:start': {
			// always answer - a start left hanging stalls the client until timeout
			try {
				const fresh = await freshCharacter() ?? character;
				console.log(fresh.name, 'wants to play', msg.beatmapId);
				const result = await startUnlessSeated(slot, fresh, msg.beatmapId, {
					xpMultiplier: isProd ? 1 : msg.xpMultiplier ?? 1, rate: msg.rate, mods: msg.mods,
				});
				console.log(fresh.name, 'play status', result.status);
				hub.sendLocal(ws, {
					type: 'play:start', result,
				});
			} catch (e) {
				console.error('[play] start failed for', character.id, e);
				hub.sendLocal(ws, {
					type: 'play:start', result: { status: 'refused' },
				});
			}
			return true;
		}
		case 'play:watch':
			feed.watch(msg.token, msg.next);
			return true;
		case 'play:unwatch':
			feed.stop();
			return true;
		case 'play:skip':
			await skipPlay(slot, msg.token);
			return true;
		case 'play:finish':
			await finishPlay(msg, slot, ws);
			return true;
		case 'play:abort':
			await abortPlay(slot, msg.token);
			return true;
		case 'play:result':
			await answerResult(ws, slot, msg);
			return true;
		default:
			return false;
	}
};

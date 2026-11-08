import { t } from '@lingui/core/macro';

import type { ServerMessage } from '@oss-idle/shared/community/wire';
import Log from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	type Mod,
	retriesOnFail,
} from '@oss-idle/shared/mods';
import type { PlayState } from '@oss-idle/shared/play';
import type {
	QueueEntry,
	QueueState,
} from '@oss-idle/shared/queue';

import { RESULT_SETTLE_MS } from '../components/result/settle';
import { focusInCarousel } from '../components/songselect/selection';
import { Score } from '../db/schema/score';
import { ScoreXP } from '../db/schema/score_xp';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import PlayQueue, { AUTOPILOT_MODE } from '../gameplay/playQueue';
import { message } from '../globals';
import { logPlayFinished } from '../logs';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import {
	autoSkip,
	PBE,
} from '../pbe/pbe';
import { selectedRuleset } from '../rulesets/registry';
import {
	launchInFlight,
	launchPlay,
} from '../scenes/launchPlay';
import SceneManager, { SCENE } from '../scenes/SceneManager';
import Account from './account';
import {
	abortLocalPlay,
	currentLocalPlay,
	finishLocalPlay,
	type LocalPlayState,
	localPlayState,
	pollLocalPlay,
	startLocalPlay,
} from './localPlay';
import Multiplayer from './multiplayer';
import {
	abortPlaySession,
	fetchPlayResult,
	inMatchMessage,
	playState,
	restrictedMessage,
	startPlaySession,
} from './play';
import {
	receivePrefs,
	resetPrefs,
} from './queuePrefs';
import { flushBeatmapScores } from './services/scores';
import Socket from './socket';

type ActivePlayState = Extract<PlayState, { phase: 'active' }>;

/** A signed-in character's queue is the server's. */
const online = (): boolean => {
	const character = Entities.character.get();
	return !!character && !character.isGuest();
};

const disabled = (): boolean => SETTINGS.autopilotMode.get() === AUTOPILOT_MODE.DISABLED;

/** What came of trying to start the head of the queue: it is playing, something
 *  else is (so the queue keeps its place), or it did not start. */
type StartResult = 'started' | 'elsewhere' | 'failed';

/** Consecutive failed starts before the queue stops trying. A refusal that
 *  clears on its own is worth another go; an anti-cheat lock or an offline
 *  client never does, and retrying those forever is a popup every two seconds. */
const MAX_START_FAILURES = 3;
/** How long after a switch the new character's play still moves the selection:
 *  a play it starts later is the queue's, not the switch's. */
const SWITCH_FOLLOW_MS = 10_000;

/** The play the character is running right now, in this client's clock. */
export type LivePlay = {
	token: string;
	beatmap: LightBeatmap;
	rate: number;
	mods: Mod[];
	startedAt: number;
	endsAt: number;
	accuracy?: number;
	grade?: ActivePlayState['grade'];
};

/**
 * Owns the character's plays, from anywhere.
 *
 * The server runs a ranked play on its own clock and pushes its state, so the
 * gameplay scene is only ever a viewer. This reacts to that state wherever the
 * player happens to be: it keeps the dock fed, mirrors results, and chains the
 * next map of the queue when one ends - none of which needs a scene to be
 * mounted. Leaving gameplay no longer stops anything.
 *
 * Signed in, the server owns the queue and chains it itself (spec/queue.md §9):
 * this mirrors its countdown and pause, and plays locally the unranked maps it
 * hands over. A guest's queue is chained here.
 *
 * It never drags the player onto the playfield - only a player still on the
 * result screen, or who pressed next on the play on screen, follows the queue
 * into its next play. Anything that re-enters on its own from elsewhere makes
 * quitting look broken, because it is.
 */
export default class PlayManager {

	/** The running play, for the dock and the resume banner. */
	public static live = new Synced<LivePlay | undefined>(undefined);

	/** Seconds until the queue starts the next map, while one is pending. */
	public static countdown = new Synced<number | undefined>(undefined);

	/** The running countdown on this clock, for drawing it filling up. */
	public static span = new Synced<{ start: number; end: number } | undefined>(undefined);

	/** Show a countdown ending at `end`. One that only moved a little is the same
	 *  countdown (a server push); one pushed back starts over, from now. */
	private static setSpan(end: number | undefined): void {
		const now = this.span.get();
		if (end === undefined) {
			if (now) void this.span.set(undefined);
			return;
		}
		if (now && Math.abs(now.end - end) < 250) return;
		void this.span.set({
			start: Date.now(), end,
		});
	}

	/** The result screen of a play just watched is up: the next map waits until
	 *  it has settled, with time to spare, and its countdown starts now. */
	private static resultHold = 0;
	/** On the result screen of a play just watched: only then does the next play
	 *  pull the player along (not from a score opened off a leaderboard). */
	private static onWatchedResult = false;
	public static leftResult(): void {
		this.onWatchedResult = false;
	}
	public static holdForResult(): void {
		this.onWatchedResult = true;
		const delay = SETTINGS.autopilotDelay.get() * 1000;
		const ms = PBE ? delay : Math.max(delay, RESULT_SETTLE_MS + 2000);
		if (online()) {
			Socket.send({
				type: 'queue:hold', ms,
			});
			return;
		}
		this.resultHold = Date.now() + ms;
		if (this.chainTimer === undefined) return;
		this.cancelChain();
		this.scheduleNext();
	}

	/** Paused: the running play finishes, and nothing follows it until resumed.
	 *  Different from clearing - the queue keeps everything in it. */
	public static paused = new Synced(false);

	public static setPaused(paused: boolean): void {
		if (!paused && disabled()) return;
		void this.paused.set(paused);
		if (online()) {
			void Socket.sendSoon({
				type: 'queue:pause', paused,
			});
			return;
		}
		if (paused) {
			// hold what was left rather than sending it back to the start - the
			// button reads as "stop the countdown", not "restart it". Captured
			// before the cancel, which is what wipes it.
			const left = this.countdown.get();
			this.cancelChain();
			this.remaining = left;
			return;
		}
		// resuming with nothing playing starts the next map rather than waiting
		// for something to end first
		if (!this.live.get()) this.scheduleNext();
	}

	/** Play this client has already shown a result for. The server keeps
	 *  reporting a play active until its record is consumed, and finalising a big
	 *  one takes a moment - without this, returning to song select relaunches the
	 *  play that just ended. */
	private static completedToken: string | undefined;
	public static complete(token: string): void {
		this.completedToken = token;
	}

	/** Maps of plays this client started, by token. A play resolves its own map
	 *  through the beatmap store, which is a lookup that can come up empty (the
	 *  store still opening, a set list not yet read) - and nothing re-triggers
	 *  afterwards, so the dock would say nothing was playing for the whole play.
	 *  Whoever starts a play already has the map; it says so here. */
	private static known = new Map<string, LightBeatmap>();
	public static attach(
		play: { token: string, rate: number, mods: Mod[], startedAt: number, endsAt: number },
		beatmap: LightBeatmap,
	): void {
		this.known.set(play.token, beatmap);
		// one play at a time: anything older is finished with
		for (const key of this.known.keys()) {
			if (key !== play.token) this.known.delete(key);
		}
		// and say so now. Waiting for a pushed state to arrive means the dock can
		// sit on "nothing playing" for the whole play if that push is missed, which
		// also silently breaks everything reading from it.
		if (this.live.get()?.token === play.token) return;
		void this.live.set({
			token: play.token,
			beatmap,
			rate: play.rate,
			mods: play.mods,
			startedAt: play.startedAt,
			endsAt: play.endsAt,
		});
	}

	/** SD / PF: the map that just failed, played again before the queue moves on. */
	private static again: LightBeatmap | undefined;

	/** Play this map again now (an SD / PF fail). */
	public static playAgain(beatmap: LightBeatmap): void {
		this.again = beatmap;
		this.cancelChain();
		void this.playNext();
	}

	/** A play that just ended away from gameplay failed with SD / PF on: it goes again.
	 *  Gameplay sends its own fails back itself. */
	private static retryIfFailed(state: { phase: string, failed?: boolean }, scene: string): void {
		const live = this.live.get();
		if (state.phase !== 'finished' || !state.failed || scene === SCENE.GAME) return;
		if (!live || !retriesOnFail(live.mods) || Multiplayer.current.get()) return;
		this.again = live.beatmap.at(live.rate, live.mods);
		this.immediate = true;
	}

	/** Token whose checkpoints this socket is watching. */
	private static watching: string | undefined;

	/** Finished token already surfaced, so a lingering state can't re-show it. */
	private static notified: string | undefined;

	private static chainTimer: number | undefined;
	private static tickTimer: number | undefined;
	/** Skip asked for the next map now, without the between-plays delay. */
	private static immediate = false;
	/** What was left of a countdown when the queue was paused, so resuming holds
	 *  it rather than sending it back to the start. */
	private static remaining: number | undefined;
	private static failures = 0;
	/** The play we last saw running, whether or not its map could be resolved. */
	private static ranToken: string | undefined;

	private static started = false;
	public static start(): void {
		if (this.started) return;
		this.started = true;

		void Synced.all(
			[SceneManager.current, playState, localPlayState],
			() => void this.evaluate(),
		);
		void Entities.character.sync(() => this.identityChanged());
		Socket.on('queue:state', ({ state }) => this.receive(state));
		Socket.on('queue:offer', msg => void this.offered(msg));
		Socket.on('queue:stopped', ({ reason }) => this.stopped(reason));
		// a guest's Disabled queue never runs
		void SETTINGS.autopilotMode.sync(mode => {
			if (mode === AUTOPILOT_MODE.DISABLED && !online()) this.setPaused(true);
		});
	}

	// --- the server's queue -------------------------------------------------

	private static serverTick: number | undefined;

	/** The server's queue: its pause, and its countdown on this clock. */
	private static receive(state: QueueState): void {
		void PlayQueue.receive(state);
		receivePrefs(state.prefs);
		void this.paused.set(state.paused);
		window.clearInterval(this.serverTick);
		this.serverTick = undefined;
		const { nextAt } = state;
		if (nextAt === undefined) {
			if (this.countdown.get() !== undefined) void this.countdown.set(undefined);
			this.setSpan(undefined);
			return;
		}
		const at = nextAt + Date.now() - state.serverNow;
		this.setSpan(at);
		const tick = () => void this.countdown.set(Math.max(0, Math.round((at - Date.now()) / 1000)));
		tick();
		this.serverTick = window.setInterval(tick, 1000);
	}

	private static stopped(reason: Extract<ServerMessage, { type: 'queue:stopped' }>['reason']): void {
		if (reason === 'restricted') Log.errorPopup(restrictedMessage());
		else if (reason === 'inMatch') Log.popup(inMatchMessage());
		else message.set(t`Could not start the next map - the queue is paused`);
	}

	/** The server's head is not ranked: play it here, if this client has it and
	 *  wins the claim (another tab may want it too). */
	private static async offered({
		serial, entry,
	}: { serial: number; entry: QueueEntry }): Promise<void> {
		if (localPlayState.get()) return;
		const beatmap = (await this.findDownloaded(entry.beatmapId))?.at(entry.rate, entry.mods);
		if (!beatmap) return;
		const claim = await Socket.request(
			{
				type: 'queue:claim', serial,
			},
			'queue:claim', 5000, r => r.serial === serial,
		).catch(() => undefined);
		if (!claim?.ok) return;
		const started = await this.launch(beatmap);
		// tell the server to move on rather than wait for a play that never ran
		if (started !== 'started') {
			Socket.send({
				type: 'queue:localEnd', skip: true,
			});
		}
	}

	/** Play a map in the scene when the player is watching, else in the background. */
	private static async launch(beatmap: LightBeatmap): Promise<StartResult> {
		const scene = SceneManager.current.get();
		return scene === SCENE.GAME || scene === SCENE.RESULT
			? (launchPlay(beatmap) ? 'started' : 'failed')
			: await this.startInBackground(beatmap);
	}

	/** The play on screen that next was pressed on: its scene waits for the next play. */
	private static skipping: string | undefined;
	public static skippingFrom(token: string): boolean {
		return this.skipping === token;
	}

	/** A player still on the result screen, or who pressed next on the play on
	 *  screen, follows the queue into its next play. */
	private static followed: string | undefined;
	private static async follow(state: ActivePlayState): Promise<void> {
		if (this.followed === state.token || this.known.has(state.token)) return;
		this.followed = state.token;
		this.skipping = undefined;
		const beatmap = await this.findDownloaded(state.beatmapId);
		const scene = SceneManager.current.get();
		if (beatmap && (scene === SCENE.RESULT || scene === SCENE.GAME)) launchPlay(beatmap);
	}

	/** PBE: a play nobody is watching ends at once. Gameplay skips the one on screen itself. */
	private static autoSkipped: string | undefined;
	private static autoSkip(token: string, scene: string, finish: () => void): void {
		if (!PBE || !autoSkip.get() || this.autoSkipped === token) return;
		if (scene === SCENE.GAME || launchInFlight() || Multiplayer.current.get()) return;
		this.autoSkipped = token;
		finish();
	}

	private static follows(state: ActivePlayState, scene: string): boolean {
		if (scene === SCENE.RESULT) return this.onWatchedResult;
		return scene === SCENE.GAME && !!this.skipping && this.skipping !== state.token;
	}

	private static async evaluate(): Promise<void> {
		const scene = SceneManager.current.get();
		const character = Entities.character.get();
		if (!character) return;

		// a play this client owns takes precedence: while one runs, it *is* the
		// character's play, and the server has nothing to say about it
		const local = localPlayState.get();
		if (local) {
			this.evaluateLocal(local, scene);
			return;
		}

		const state = playState.get();
		// A guest has no server state ever, and its local play has just told us it
		// is gone by clearing its own - so this is where a guest's play ends, and
		// it has to end here the same way a server one does below.
		if (!state || character.isGuest()) {
			this.unwatch();
			// A dropped socket clears the state too, and the play it was reporting
			// is still running on the server. Ending here would clear the dock and
			// start chaining against it - and a long outage would then pause the
			// queue on failed starts.
			if (!character.isGuest() && !Socket.connected.get()) return;
			void this.endedHere();
			return;
		}

		if (state.phase === 'active') {
			await this.evaluateActive(state, scene);
			return;
		}

		this.unwatch();
		this.retryIfFailed(state, scene);
		// awaited: the result below carries the levels as they were *before* the
		// play's parked purchases spent them, so the two must not race
		await this.endedHere();
		if (state.phase === 'finished' && state.notify && this.notified !== state.token) {
			this.notified = state.token;
			await this.consumeResult(state.token, scene);
		}
	}

	private static async evaluateActive(state: ActivePlayState, scene: string): Promise<void> {
		// Already resulted, just not yet consumed server-side. From here that is
		// an ending like any other - and it is checked before cancelling, since
		// a second push for the same finished play would otherwise wipe the
		// countdown its first one started and nothing would reschedule.
		if (state.token === this.completedToken) {
			this.unwatch();
			await this.endedHere();
			return;
		}
		// a play is running: nothing to chain into yet
		this.cancelChain();
		// gameplay draws the play itself; anywhere else the dock needs the
		// server's checkpoints to show accuracy and grade
		this.ranToken = state.token;
		if (scene === SCENE.GAME) this.unwatch();
		else this.watch(state.token);
		if (online() && this.follows(state, scene)) void this.follow(state);
		else this.autoSkip(state.token, scene, () => Socket.send({
			type: 'play:finish', token: state.token, next: 0, away: true,
		}));
		if (scene !== SCENE.GAME) this.skipping = undefined;
		await this.trackLive(state);
	}

	/**
	 * Nothing is running any more. Drop the dock, re-read the character if a play
	 * had been holding it (that is the moment the server has applied whatever the
	 * play deferred, and the only moment worth a round trip), and let the queue
	 * take it from there.
	 */
	private static async endedHere(): Promise<void> {
		// A playfield still on screen ends on its own clock, which can run behind
		// the server's: chaining now would replace the play mid-song. Leaving it
		// for the result screen re-runs this from there.
		if (SceneManager.current.get() === SCENE.GAME) return;
		// `live` alone is not enough: a play on a map this client cannot resolve
		// (another device, a set never downloaded) never reaches the dock, and its
		// ending would then chain nothing.
		const ended = !!this.live.get() || !!this.ranToken;
		this.ranToken = undefined;
		this.clearLive();
		// Only a play that actually ended pulls the queue along. evaluate runs on
		// every scene change too, and chaining from those would start a background
		// play the moment an idle player walked between screens - the cold start is
		// what startNow is for.
		if (!ended) return;
		// A guest has no server-side character to re-read. For everyone else this is
		// the authority on the levels: a result's gains name what the play left,
		// before anything it deferred was spent, so nothing writes those back.
		// A failed read must not take the chain below with it - nothing else would
		// ever retry it.
		if (!Entities.character.get()?.isGuest()) {
			await Account.refresh().catch(e => console.warn('[queue] refresh failed', e));
		}
		this.scheduleNext();
	}

	/** The local session's twin of the server-state path: same dock, same
	 *  chaining, no socket. */
	private static evaluateLocal(state: LocalPlayState, scene: string): void {
		this.unwatch();

		if (state.phase === 'active') {
			this.cancelChain();
			this.pollLocal(true);
			this.ranToken = state.token;
			const run = currentLocalPlay();
			if (run) {
				void this.live.set({
					token: state.token,
					beatmap: run.beatmap,
					rate: run.rate,
					mods: run.mods,
					startedAt: state.startedAt,
					endsAt: state.endsAt,
					accuracy: state.accuracy,
					grade: state.grade,
				});
			}
			this.autoSkip(state.token, scene, () => finishLocalPlay(state.token));
			return;
		}

		// finished: the session already built, saved and paid for it. Clearing the
		// state hands the character back to the server's view for the next play.
		this.pollLocal(false);
		this.retryIfFailed(state, scene);
		void localPlayState.set(undefined);
		void this.endedHere();
	}

	/** A local play has no socket pushing checkpoints, so its live accuracy and
	 *  grade are read off its own samples on a timer. */
	private static localTicker: number | undefined;
	private static pollLocal(on: boolean): void {
		if (on === (this.localTicker !== undefined)) return;
		if (!on) {
			window.clearInterval(this.localTicker);
			this.localTicker = undefined;
			return;
		}
		this.localTicker = window.setInterval(() => pollLocalPlay(), 1000);
	}

	// --- the queue ----------------------------------------------------------

	/** Start the next map once the delay is up. The play the player is watching
	 *  ends on the result screen, so the countdown is visible there; started from
	 *  anywhere else it just happens. */
	private static scheduleNext(): void {
		// the server chains a signed-in queue; an SD / PF retry is started here too,
		// and start-or-join lands both on the same play
		if (online() && !this.again) return;
		if (this.chainTimer !== undefined) return;
		if (this.paused.get()) {
			// a retry held back by a pause is dropped, not replayed on a later ending
			this.again = undefined;
			this.immediate = false;
			return;
		}
		if (!this.again && !PlayQueue.next()) return;

		const delay = this.immediate
			? 0
			: this.remaining ?? Math.max(
				SETTINGS.autopilotDelay.get(),
				(this.resultHold - Date.now()) / 1000,
			);
		this.immediate = false;
		this.remaining = undefined;
		let left = Math.round(delay);
		void this.countdown.set(left);
		this.setSpan(Date.now() + delay * 1000);
		this.tickTimer = window.setInterval(() => {
			left = Math.max(0, left - 1);
			void this.countdown.set(left);
		}, 1000);
		this.chainTimer = window.setTimeout(() => {
			this.cancelChain();
			void this.playNext();
		}, delay * 1000);
	}

	public static cancelChain(): void {
		const ticking = this.chainTimer !== undefined;
		if (this.chainTimer !== undefined) window.clearTimeout(this.chainTimer);
		if (this.tickTimer !== undefined) window.clearInterval(this.tickTimer);
		this.chainTimer = undefined;
		this.tickTimer = undefined;
		// only a pause sets this, and it captures the value before calling here
		this.remaining = undefined;
		// signed in, the countdown on show is the server's: only this client's own
		// timer is cancelled here
		if (online() && !ticking) return;
		if (this.countdown.get() !== undefined) void this.countdown.set(undefined);
		this.setSpan(undefined);
	}

	/** Signing in or out, or watching another character or ruleset, swaps whose
	 *  queue this is: nothing of the other one's countdown, pause or timers carries
	 *  over. The one left behind keeps playing on the server; its play is not this
	 *  screen's any more. */
	private static watched: string | undefined;
	/** A switch puts song select on the new character's play once its state comes in.
	 *  `from` is the play left behind, whose stale state can land first. */
	private static switched: { from?: string, at: number } | undefined;
	private static identityChanged(): void {
		const now = online() ? `${Entities.character.get()?.id}:${selectedRuleset.get()}` : 'local';
		if (now === this.watched) return;
		const switched = this.watched !== undefined && this.watched !== 'local' && now !== 'local';
		this.watched = now;
		this.switched = switched ? {
			from: this.live.get()?.token ?? this.ranToken, at: Date.now(),
		} : undefined;
		if (switched) this.leavePlay();
		window.clearInterval(this.serverTick);
		this.serverTick = undefined;
		this.cancelChain();
		this.again = undefined;
		this.immediate = false;
		this.resultHold = 0;
		void this.paused.set(false);
		if (this.countdown.get() !== undefined) void this.countdown.set(undefined);
		this.setSpan(undefined);
		PlayQueue.reset();
		resetPrefs();
	}

	/**
	 * Run the head of the queue - in the background when the player is elsewhere,
	 * in the gameplay scene when that is where they already are.
	 *
	 * The queue only moves on once the play is actually running. Advancing first
	 * and hoping meant a launch that quietly did nothing (a wedged guard, a map
	 * that would not load) rotated the queue and stopped the loop dead, with the
	 * countdown sitting at zero and nothing to say why.
	 */
	private static async playNext(): Promise<void> {
		const again = this.again;
		const next = again ?? PlayQueue.next();
		if (!next) return;
		// scoped to the one skip that asked for it: the paths that do not go
		// through scheduleNext would otherwise leave it set for the next play
		this.immediate = false;

		const started = await this.launch(next);

		if (started === 'started') {
			this.failures = 0;
			this.again = undefined;
			if (!again) PlayQueue.advance(next);
			return;
		}
		// something else is playing: the queue is intact and its ending chains
		if (started === 'elsewhere') {
			this.failures = 0;
			return;
		}
		console.warn('[queue] could not start', next.metadata.version);
		if (++this.failures >= MAX_START_FAILURES) {
			this.failures = 0;
			this.again = undefined;
			message.set(t`Could not start the next map - the queue is paused`);
			this.setPaused(true);
			return;
		}
		this.retry();
	}

	/** Re-arm the chain after a failed start, without the full between-plays wait. */
	private static retry(): void {
		this.cancelChain();
		this.chainTimer = window.setTimeout(() => {
			this.cancelChain();
			void this.playNext();
		}, 2000);
	}

	/**
	 * Start a play without a scene: the server simulates and runs it, and its
	 * pushed state is all this client needs. A map the server won't rank has no
	 * background form yet, so it falls back to the gameplay scene.
	 */
	private static async startInBackground(beatmap: LightBeatmap): Promise<StartResult> {
		const character = Entities.character.get();
		const beatmapId = beatmap.metadata.id;
		const session = await startPlaySession(
			character, beatmapId, beatmap.lockedRate, beatmap.lockedMods,
		);
		if (session.mode === 'ranked') {
			// start-or-join: another tab or device may already have a play running,
			// and the server hands that one back instead. It is not this map, so the
			// queue keeps it - and the play that *is* running will pull the queue
			// along when it ends, the way any other play does.
			if (session.beatmapId !== beatmapId) return 'elsewhere';
			this.attach(session, beatmap);
			return 'started';
		}
		// Refused covers an anti-cheat lock *and* any connection error or timeout.
		// Either way this is a background start: the caller decides what to say,
		// rather than pulling the player onto the playfield for a dialog they
		// never asked for.
		if (session.mode === 'refused') return 'failed';
		if (session.mode === 'restricted') {
			Log.errorPopup(restrictedMessage());
			return 'failed';
		}
		if (session.mode === 'inMatch') {
			Log.popup(inMatchMessage());
			return 'failed';
		}

		const chart = await beatmap.load().catch(() => undefined);
		if (!chart) return 'failed';
		// the simulation reads the local database and walks the whole map: a throw
		// here would reject playNext, which every caller fires and forgets, and the
		// loop would stop with nothing but an unhandled rejection to show for it
		try {
			await startLocalPlay(character, beatmap, chart, session);
		} catch (e) {
			console.warn('[queue] local play failed to start', e);
			return 'failed';
		}
		return 'started';
	}

	/** Start the queue now. A queue built while nothing is playing has nothing to
	 *  wait for - no play is going to end and pull it along - so this is what
	 *  gets it going. */
	public static startNow(): void {
		if (disabled()) return;
		if (online()) {
			void this.paused.set(false);
			Socket.send({ type: 'queue:start' });
			return;
		}
		void this.paused.set(false);
		this.cancelChain();
		void this.playNext();
	}

	/** Drop the running play and go straight to the next one. The abort clears
	 *  the play state, which is what actually triggers the chain - routing it
	 *  through the one path stops a skip and a natural end from both advancing. */
	public static async skip(): Promise<void> {
		const live = this.live.get();
		if (online()) {
			const local = localPlayState.get();
			if (local) {
				abortLocalPlay(local.token);
				Socket.send({
					type: 'queue:localEnd', skip: true,
				});
			} else {
				if (SceneManager.current.get() === SCENE.GAME) this.skipping = live?.token;
				Socket.send({ type: 'queue:skip' });
			}
			return;
		}
		this.cancelChain();
		this.immediate = true;
		if (!live) {
			void this.playNext();
			return;
		}
		// Both aborts end the play by clearing its state, and that lands in
		// endedHere, which chains - immediately, since `immediate` is set. Doing it
		// here as well would run two chains, and the queue would advance twice.
		await this.drop(live.token);
	}

	/** Drop the running play and the queue with it (multiplayer needs the player free). */
	public static async abort(): Promise<void> {
		PlayQueue.stop();
		this.cancelChain();
		const live = this.live.get();
		if (live) await this.drop(live.token);
	}

	private static async drop(token: string): Promise<void> {
		if (localPlayState.get()) abortLocalPlay(token);
		else await abortPlaySession(token);
	}

	// --- server state -------------------------------------------------------

	/** Have the server push this play's live checkpoints (accuracy/grade). */
	private static watch(token: string): void {
		if (this.watching === token) return;
		this.watching = token;
		Socket.send({
			type: 'play:watch', token,
		});
	}

	private static unwatch(): void {
		if (!this.watching) return;
		this.watching = undefined;
		Socket.send({ type: 'play:unwatch' });
	}

	private static clearLive(): void {
		if (this.live.get()) void this.live.set(undefined);
	}

	/** Stop following the play on show: the socket reconnects onto the new slot and
	 *  says what runs there. */
	private static leavePlay(): void {
		this.unwatch();
		this.known.clear();
		this.ranToken = undefined;
		this.clearLive();
		if (SceneManager.current.get() === SCENE.GAME) SceneManager.set(SCENE.SELECT);
	}

	/** Keep the dock's view of the running play in sync. */
	private static async trackLive(state: ActivePlayState): Promise<void> {
		const current = this.live.get();
		const same = current?.token === state.token;
		if (same
			&& current.accuracy === state.accuracy
			&& current.grade === state.grade) return;
		const beatmap = same
			? current.beatmap
			: this.known.get(state.token) ?? await this.findDownloaded(state.beatmapId);
		if (!beatmap) return;
		this.followSwitch(state.token, beatmap);
		const skew = Date.now() - state.serverNow;
		void this.live.set({
			token: state.token,
			beatmap,
			rate: state.rate,
			mods: state.mods,
			startedAt: state.startedAt + skew,
			endsAt: state.endsAt + skew,
			accuracy: state.accuracy,
			grade: state.grade,
		});
	}

	private static followSwitch(token: string, beatmap: LightBeatmap): void {
		const switched = this.switched;
		if (!switched || token === switched.from) return;
		this.switched = undefined;
		if (Date.now() - switched.at < SWITCH_FOLLOW_MS) focusInCarousel(beatmap);
	}

	/** Take a finished play's authoritative result, quietly: only a play the
	 *  player watched leads to its result screen, and that is the scene's doing. */
	private static async consumeResult(token: string, scene: string): Promise<void> {
		// The scene marks a play complete when it tears down: it has shown the
		// result and logged it, and doing either again is one score reported twice.
		// While it is still up it owns its play's result even though it has not said
		// so yet - a sweep finalising first would otherwise mirror the score here and
		// the scene would mirror it again on its own ending. A play it isn't showing
		// (one that ended as the player launched another) is still ours to log.
		if (token === this.completedToken || (scene === SCENE.GAME && this.known.has(token))) return;
		const res = await fetchPlayResult(token, false, false).catch(() => null);
		if (!res || res.failed || !res.score) return;
		const dto = res.score;

		// the one started keeps its playlist's locked rate and mods
		const beatmap = this.known.get(token) ?? await this.findDownloaded(dto.beatmapId);
		if (!beatmap) return;

		// a fresh board for the leaderboard the save refreshes, so the score arrives on it live
		await flushBeatmapScores(dto.beatmapId);
		const [saved] = await Score.addServerScores([dto]).catch(() => [Score.fromDTO(dto)]);
		void ScoreXP.record(saved, res.gains);
		logPlayFinished(saved, beatmap, res.gains);
	}

	/** The downloaded (playable) difficulty for a beatmap id, or null. */
	public static async findDownloaded(
		beatmapId: number,
	): Promise<LightBeatmap | null> {
		for (const set of await BeatmapStore.getAllSets()) {
			const beatmap = set.beatmaps.find(b => b.metadata.id === beatmapId);
			if (beatmap) return beatmap;
		}
		return null;
	}
}

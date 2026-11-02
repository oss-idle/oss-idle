/**
 * The client-side life of a play, from "running" to a result on screen.
 *
 * This is a pure reducer: it never touches the clock, the socket, the audio or
 * React. It takes an event and returns the next state plus the effects the
 * caller should carry out. That is the point - every ending a play can have
 * (the song running out, a fail, a debug skip, a skip whose replay never
 * arrives, a server result, a server that will not answer, a quit) is reachable
 * in a unit test without a browser.
 *
 * The invariants it exists to hold, each of which was previously spread across
 * the scene and broken one ending at a time:
 *
 *  - a play releases the audio and freezes the playfield exactly once
 *  - a play shows exactly one result, and always shows one
 *  - a terminal phase ignores everything that arrives late
 *  - a skip cannot sit forever: the replay either arrives or times out, and
 *    both go to the same place
 */

/**
 * How the play is scored, which decides who owns its result.
 *
 * Only `debug` scores itself. Every other play is resolved up front by someone
 * else - the server for `ranked`, the local session for `guest` and `unranked` -
 * and the scene asks that owner for the result rather than deciding one. That is
 * what lets a play keep running while nobody is watching it.
 */
export type PlayScoring = 'ranked' | 'guest' | 'unranked' | 'debug';

export type PlayPhase =
	/** notes are being judged */
	| 'running'
	/** a ranked skip is waiting for the server to release the rest of the replay */
	| 'awaiting-replay'
	/** the map is resolved; the local score (and its pp) is being built */
	| 'finalising'
	/** ranked only: asking the server for the authoritative result */
	| 'submitting'
	/** a result is on screen */
	| 'finished'
	/** left gameplay without a result */
	| 'exited';

export type PlayEvent =
	/** the song ran out, or HP did */
	| { type: 'ended' }
	/** debug skip; `cursor` is how far the local replay has got */
	| { type: 'skip', cursor: number }
	/** a slice of replay offsets arrived; `done` = nothing further is coming */
	| { type: 'offsets', done: boolean }
	/** the replay never completed - finish on what is in hand */
	| { type: 'replay-timeout' }
	/** the local score is built and ready to show */
	| { type: 'local-ready', failed: boolean }
	/** the owner answered; `hasScore` is false for a failed play, which carries none */
	| { type: 'owner-result', hasScore: boolean }
	/** the owner could not answer; `retryable` is false once its result is gone */
	| { type: 'owner-error', retryable: boolean }
	/** the player quit */
	| { type: 'abort' }
	/** the next play is taking this scene over: this one ends, with nothing to show */
	| { type: 'replaced' };

export type PlayEffect =
	/** advance the simulation to the end so every remaining note is judged */
	| { type: 'resolve-map' }
	/** drop hitsounds already queued ahead on the audio clock */
	| { type: 'stop-hitsounds' }
	/** hand the gameplay buffer back to the streaming player */
	| { type: 'release-audio' }
	/** switch the playfield to its outro clock so it stops tracking the song */
	| { type: 'freeze-playfield' }
	/** ask the server to end the play and send the rest of the replay */
	| { type: 'request-server-finish', cursor: number }
	/** this play is over for us - never auto-rejoin it */
	| { type: 'mark-complete' }
	/** compute pp and build the local score; answers with `local-ready` */
	| { type: 'build-local-score' }
	/** ask the owner for the authoritative result; answers with
	 *  `owner-result`/`owner-error` */
	| { type: 'fetch-result', attempt: number }
	/** show the result screen */
	| { type: 'show-result', source: 'owner' | 'local', failed: boolean }
	/** leave gameplay without a result */
	| { type: 'exit' };

export type PlayState = {
	phase: PlayPhase,
	scoring: PlayScoring,
	/** how many times the authoritative result has been asked for */
	attempt: number,
	/** whether the play was failed, as far as the client knows */
	failed: boolean,
};

/** How many times to ask for the authoritative result before falling back to
 *  the local replay. The wait is the owner storing the play, so this polls
 *  rather than backing off. */
export const RESULT_ATTEMPTS = 50;

export const startPlay = (scoring: PlayScoring): PlayState => ({
	phase: 'running', scoring, attempt: 0, failed: false,
});

export const isTerminal = (state: PlayState): boolean =>
	state.phase === 'finished' || state.phase === 'exited';

export type PlayStep = { state: PlayState, effects: PlayEffect[] };

const step = (
	state: PlayState,
	effects: PlayEffect[],
	next: Partial<PlayState> = {},
): PlayStep => ({
	state: {
		...state, ...next,
	},
	effects,
});

/** Everything a play does on its way out, in one place so no ending can skip a
 *  step: silence what is queued, hand back the audio, stop the playfield
 *  tracking a song that is over, and give up the right to rejoin. */
const teardown = (state: PlayState): PlayEffect[] => [
	{ type: 'stop-hitsounds' },
	{ type: 'release-audio' },
	{ type: 'freeze-playfield' },
	...(state.scoring === 'debug' ? [] : [{ type: 'mark-complete' } as const]),
	{ type: 'build-local-score' },
];

const finish = (state: PlayState, failed: boolean): PlayStep =>
	step(state, teardown(state), {
		phase: 'finalising', failed,
	});

const runningStep = (state: PlayState, event: PlayEvent): PlayStep => {
	if (event.type === 'ended') return finish(state, state.failed);
	if (event.type !== 'skip') return step(state, []);

	// A ranked play's replay arrives a few seconds at a time, so the local
	// schedule holds only what has been revealed - resolving now would score a
	// fraction of the map. Ask the server to end it and send the rest.
	return state.scoring === 'ranked'
		? step(state, [
			{ type: 'stop-hitsounds' },
			{
				type: 'request-server-finish', cursor: event.cursor,
			},
		], { phase: 'awaiting-replay' })
		: step(state, [{ type: 'resolve-map' }, ...teardown(state)], { phase: 'finalising' });
};

/** `done` and a timeout both land here: finish on whatever is in hand, which
 *  for a failed play is everything that legitimately exists. */
const awaitingReplayStep = (state: PlayState, event: PlayEvent): PlayStep => {
	const settled = (event.type === 'offsets' && event.done) || event.type === 'replay-timeout';
	if (!settled) return step(state, []);
	return step(state, [{ type: 'resolve-map' }, ...teardown(state)], { phase: 'finalising' });
};

const finalisingStep = (state: PlayState, event: PlayEvent): PlayStep => {
	if (event.type !== 'local-ready') return step(state, []);

	// a debug play is the only one that scores itself; everything else asks the
	// owner that resolved it (the server, or the local session)
	return state.scoring === 'debug'
		? step(state, [{
			type: 'show-result', source: 'local', failed: event.failed,
		}], {
			phase: 'finished', failed: event.failed,
		})
		: step(state, [{
			type: 'fetch-result', attempt: 0,
		}], {
			phase: 'submitting', attempt: 0, failed: event.failed,
		});
};

const submittingStep = (state: PlayState, event: PlayEvent): PlayStep => {
	// a failed play carries no owner-side score, so its own replay is the only
	// thing there is to show
	if (event.type === 'owner-result') {
		return step(state, [{
			type: 'show-result',
			source: event.hasScore ? 'owner' : 'local',
			failed: !event.hasScore,
		}], {
			phase: 'finished', failed: !event.hasScore,
		});
	}
	if (event.type !== 'owner-error') return step(state, []);

	const attempt = state.attempt + 1;
	if (event.retryable && attempt < RESULT_ATTEMPTS) {
		return step(state, [{
			type: 'fetch-result', attempt,
		}], { attempt });
	}
	return step(state, [{
		type: 'show-result', source: 'local', failed: state.failed,
	}], { phase: 'finished' });
};

const PHASES: Record<
	'running' | 'awaiting-replay' | 'finalising' | 'submitting',
	(state: PlayState, event: PlayEvent) => PlayStep
> = {
	'running': runningStep,
	'awaiting-replay': awaitingReplayStep,
	'finalising': finalisingStep,
	'submitting': submittingStep,
};

export const playReducer = (state: PlayState, event: PlayEvent): PlayStep => {
	// a finished or exited play has nothing left to do; late arrivals (a slow
	// server result, a timer that already fired) must not reopen it
	if (isTerminal(state)) return step(state, []);

	if (event.type === 'abort') {
		return step(state, [{ type: 'release-audio' }, { type: 'exit' }], { phase: 'exited' });
	}
	if (event.type === 'replaced') return step(state, [], { phase: 'exited' });

	const handler = PHASES[state.phase as keyof typeof PHASES];
	return handler ? handler(state, event) : step(state, []);
};

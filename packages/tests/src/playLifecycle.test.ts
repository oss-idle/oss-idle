import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	isTerminal,
	type PlayEffect,
	type PlayEvent,
	playReducer,
	type PlayScoring,
	type PlayState,
	RESULT_ATTEMPTS,
	startPlay,
} from '@oss-idle/shared/sim/playLifecycle';

/** Drive a play through a sequence, collecting everything it asked for. */
const run = (scoring: PlayScoring, events: PlayEvent[]) => {
	let state: PlayState = startPlay(scoring);
	const effects: PlayEffect[] = [];
	for (const event of events) {
		const stepped = playReducer(state, event);
		state = stepped.state;
		effects.push(...stepped.effects);
	}
	return {
		state, effects, types: effects.map(e => e.type),
	};
};

const count = (effects: PlayEffect[], type: PlayEffect['type']) =>
	effects.filter(e => e.type === type).length;

const shown = (effects: PlayEffect[]) =>
	effects.find(e => e.type === 'show-result') as
		Extract<PlayEffect, { type: 'show-result' }> | undefined;

describe('a play that ends on its own', () => {
	it('tears down and shows its own replay when nobody else owns it', () => {
		const { state, types, effects } = run('debug', [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: false, 
			},
		]);
		expect(types).toEqual([
			'stop-hitsounds', 'release-audio', 'freeze-playfield', 'build-local-score',
			'show-result',
		]);
		expect(shown(effects)?.source).toBe('local');
		expect(state.phase).toBe('finished');
	});

	it('asks the owner for the result of a play it did not score itself', () => {
		const { state, effects, types } = run('ranked', [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
		]);
		// a ranked play also gives up the right to be rejoined
		expect(types).toContain('mark-complete');
		expect(shown(effects)?.source).toBe('owner');
		expect(state.phase).toBe('finished');
	});

	it('shows its own replay for a failed play, which has no owner score', () => {
		const { effects } = run('ranked', [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: true, 
			},
			{
				type: 'owner-result', hasScore: false, 
			},
		]);
		expect(shown(effects)).toMatchObject({
			source: 'local', failed: true,
		});
	});
});

describe('waiting on the owner', () => {
	it('polls while the result is still being stored', () => {
		const { effects, state } = run('ranked', [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-error', retryable: true, 
			},
			{
				type: 'owner-error', retryable: true, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
		]);
		expect(count(effects, 'fetch-result')).toBe(3);
		expect(shown(effects)?.source).toBe('owner');
		expect(state.phase).toBe('finished');
	});

	it('gives up on its own replay rather than waiting forever', () => {
		const events: PlayEvent[] = [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: false, 
			},
		];
		for (let i = 0; i < RESULT_ATTEMPTS + 5; i++) {
			events.push({
				type: 'owner-error', retryable: true, 
			});
		}
		const { effects, state } = run('ranked', events);
		expect(count(effects, 'fetch-result')).toBe(RESULT_ATTEMPTS);
		expect(shown(effects)?.source).toBe('local');
		expect(state.phase).toBe('finished');
	});

	it('does not retry once the result is gone for good', () => {
		const { effects } = run('ranked', [
			{ type: 'ended' },
			{
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-error', retryable: false, 
			},
		]);
		expect(count(effects, 'fetch-result')).toBe(1);
		expect(shown(effects)?.source).toBe('local');
	});
});

describe('the debug skip', () => {
	it('resolves the map itself when the whole replay is already in hand', () => {
		const { types, state } = run('guest', [{
			type: 'skip', cursor: 0, 
		}]);
		expect(types).toEqual([
			'resolve-map', 'stop-hitsounds', 'release-audio', 'freeze-playfield',
			// a local play gives up the right to be rejoined too - its session
			// owns the result the same way the server owns a ranked one
			'mark-complete', 'build-local-score',
		]);
		expect(state.phase).toBe('finalising');
	});

	it('asks the server first on a ranked play, since it only holds a prefix', () => {
		const { effects, state } = run('ranked', [{
			type: 'skip', cursor: 31, 
		}]);
		expect(effects).toContainEqual({
			type: 'request-server-finish', cursor: 31,
		});
		expect(effects.some(e => e.type === 'resolve-map')).toBe(false);
		expect(state.phase).toBe('awaiting-replay');
	});

	it('finishes once the rest of the replay lands', () => {
		const { types, state } = run('ranked', [
			{
				type: 'skip', cursor: 31, 
			},
			{
				type: 'offsets', done: false, 
			},
			{
				type: 'offsets', done: true, 
			},
		]);
		expect(types).toContain('resolve-map');
		expect(state.phase).toBe('finalising');
	});

	it('finishes on what it has if the replay never completes', () => {
		const { types, state } = run('ranked', [
			{
				type: 'skip', cursor: 31, 
			},
			{ type: 'replay-timeout' },
		]);
		expect(types).toContain('resolve-map');
		expect(state.phase).toBe('finalising');
	});

	it('keeps waiting while slices are still coming', () => {
		const { state } = run('ranked', [
			{
				type: 'skip', cursor: 0, 
			},
			{
				type: 'offsets', done: false, 
			},
		]);
		expect(state.phase).toBe('awaiting-replay');
	});
});

describe('quitting', () => {
	it.each<[string, PlayEvent[]]>([
		['while running', []],
		['while waiting on the replay', [{
			type: 'skip', cursor: 0, 
		}]],
		['while finalising', [{ type: 'ended' }]],
		['while submitting', [{ type: 'ended' }, {
			type: 'local-ready', failed: false, 
		}]],
	])('hands the audio back and leaves, %s', (_label, before) => {
		const { state, types } = run('ranked', [...before, { type: 'abort' }]);
		expect(state.phase).toBe('exited');
		expect(types).toContain('release-audio');
		expect(types).toContain('exit');
		expect(types).not.toContain('show-result');
	});
});

describe('invariants every path has to hold', () => {
	const paths: [string, PlayScoring, PlayEvent[]][] = [
		['natural guest', 'guest', [
			{ type: 'ended' }, {
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
		]],
		['natural ranked', 'ranked', [
			{ type: 'ended' }, {
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
		]],
		['failed ranked', 'ranked', [
			{ type: 'ended' }, {
				type: 'local-ready', failed: true, 
			},
			{
				type: 'owner-result', hasScore: false, 
			},
		]],
		['skipped guest', 'guest', [
			{
				type: 'skip', cursor: 0, 
			}, {
				type: 'local-ready', failed: false, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
		]],
		['natural debug', 'debug', [
			{ type: 'ended' }, {
				type: 'local-ready', failed: false, 
			},
		]],
		['skipped ranked', 'ranked', [
			{
				type: 'skip', cursor: 12, 
			}, {
				type: 'offsets', done: true, 
			},
			{
				type: 'local-ready', failed: false, 
			}, {
				type: 'owner-result', hasScore: true, 
			},
		]],
		['skipped ranked, replay lost', 'ranked', [
			{
				type: 'skip', cursor: 12, 
			}, { type: 'replay-timeout' },
			{
				type: 'local-ready', failed: false, 
			}, {
				type: 'owner-error', retryable: false, 
			},
		]],
	];

	it.each(paths)('%s reaches a result exactly once', (_label, scoring, events) => {
		const { state, effects } = run(scoring, events);
		expect(state.phase).toBe('finished');
		expect(count(effects, 'show-result')).toBe(1);
	});

	it.each(paths)('%s hands the audio back exactly once', (_label, scoring, events) => {
		const { effects } = run(scoring, events);
		expect(count(effects, 'release-audio')).toBe(1);
		expect(count(effects, 'freeze-playfield')).toBe(1);
	});

	it.each(paths)('%s ignores anything arriving after the end', (_label, scoring, events) => {
		const { state: ended, effects } = run(scoring, events);
		const late: PlayEvent[] = [
			{
				type: 'offsets', done: true, 
			},
			{
				type: 'owner-result', hasScore: true, 
			},
			{ type: 'replay-timeout' },
			{ type: 'ended' },
			{ type: 'abort' },
		];
		let state = ended;
		const after: PlayEffect[] = [];
		for (const event of late) {
			const stepped = playReducer(state, event);
			state = stepped.state;
			after.push(...stepped.effects);
		}
		expect(after).toEqual([]);
		expect(state).toEqual(ended);
		expect(isTerminal(state)).toBe(true);
		expect(count(effects, 'show-result')).toBe(1);
	});

	it('a play replaced by the next one shows no result when it ends behind it', () => {
		const { state, types } = run('ranked', [{ type: 'replaced' }, { type: 'ended' }]);
		expect(state.phase).toBe('exited');
		expect(types).toEqual([]);
	});
});

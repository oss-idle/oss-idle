import {
	describe,
	expect,
	it,
} from 'vitest';

import { requeue } from '../../client/src/gameplay/requeue';

type E = { id: string, played?: number };
const e = (id: string, played?: number): E => ({
	id, played,
});
const ids = (list: E[]) => list.map(x => x.id + (x.played ? `+${x.played}` : ''));
const same = (a: E, b: E) => a.id === b.id;

describe('requeue', () => {
	it('carries on after the map that just went to the back', () => {
		const pool = ['a', 'b', 'c', 'd', 'x'].map(id => e(id));
		expect(ids(requeue(pool, [e('c'), e('a'), e('b')], same))).toEqual(['c', 'd', 'x', 'a', 'b']);
	});

	it('played once, carries on from the next queued map to the playlist end', () => {
		const pool = ['a', 'b', 'c', 'd', 'x'].map(id => e(id));
		expect(ids(requeue(pool, [e('c'), e('d')], same, undefined, true))).toEqual(['c', 'd', 'x']);
	});

	it('keeps a map partway through its repeats at the head', () => {
		const pool = ['a', 'b', 'c'].map(id => e(id));
		expect(ids(requeue(pool, [e('b', 1), e('c'), e('a')], same))).toEqual(['b+1', 'c', 'a']);
	});

	it('drops a map that left the playlist, from the next queued one still in it', () => {
		const pool = ['a', 'c', 'd'].map(id => e(id));
		expect(ids(requeue(pool, [e('c'), e('d'), e('a'), e('b')], same))).toEqual(['c', 'd', 'a']);
	});

	it('keeps a playlist\'s second copy of the current map', () => {
		const pool = ['a', 'b', 'a'].map(id => e(id));
		expect(ids(requeue(pool, [e('b'), e('a')], same))).toEqual(['b', 'a', 'a']);
	});
});

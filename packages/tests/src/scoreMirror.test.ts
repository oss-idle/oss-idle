import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';
import {
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { Judgements } from '@oss-idle/shared/rulesets/mania/judgement';
import type { ScoreDTO } from '@oss-idle/shared/score';

vi.hoisted(() => vi.stubGlobal('window', { addEventListener: () => {} }));
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: '' }));

const { DB } = await import('@oss-idle/client/db/dao');
const { Score } = await import('@oss-idle/client/db/schema/score');
const { ScoreBest } = await import('@oss-idle/client/db/schema/score_best');
const { ScoreBestPP } = await import('@oss-idle/client/db/schema/score_best_pp');

const require = createRequire(import.meta.url);

const dto = (id: number, unranked: boolean, score: number, beatmapId = 1): ScoreDTO => ({
	id, unranked, characterId: 7, beatmapId, score, accuracy: 0.9, maxCombo: 100,
	judgements: Object.fromEntries(Judgements.map(j => [j, 0])),
	grade: 'A', pp: 0, ur: 0, pfc: false, rate: 1, mods: [], playedAt: 1,
});

let db: import('sql.js').Database;
const rows = () =>
	db.exec('SELECT onlineId, unranked, score FROM score ORDER BY id')[0]?.values ?? [];
const bestScore = () => db.exec(`SELECT s.score FROM score_best b JOIN score s ON s.id = b.scoreId
	WHERE b.characterId = 7 AND b.beatmapId = 1`)[0]?.values[0][0];

beforeAll(async () => {
	const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
	db = new SQL.Database();
	for (const t of [Score.table, ScoreBest.table, ScoreBestPP.table]) db.run(t.ddl());
	Object.assign(DB, {
		write: async <T>(fn: (d: typeof db) => T) => fn(db),
		read: async <T>(fn: (d: typeof db) => T) => fn(db),
	});
});

describe('Score.addServerScores', () => {
	it('keeps ranked and unranked scores apart, once each, with the best of their map', async () => {
		const [ranked, unranked] = await Score.addServerScores([dto(5, false, 100), dto(5, true, 300)]);
		expect(ranked.id).not.toBe(unranked.id);
		expect(bestScore()).toBe(300);

		const [again] = await Score.addServerScores([dto(5, false, 100)]);
		expect(again.id).toBe(ranked.id);
		// another ruleset's score 5 is on another map
		await Score.addServerScores([dto(5, false, 50, 2)]);
		expect(rows()).toEqual([[5, 0, 100], [5, 1, 300], [5, 0, 50]]);
	});

	it('moves the best only to a better new play', async () => {
		await Score.addServerScores([dto(6, false, 500), dto(7, false, 400)]);
		expect(bestScore()).toBe(500);
		await Score.storeServerScores([dto(8, false, 50)]);
		expect(bestScore()).toBe(500);
	});

	it('keeps every play the server never stored', async () => {
		await Score.addServerScores([dto(0, false, 10, 3)]);
		await Score.addServerScores([dto(0, false, 20, 3)]);
		expect(rows().filter(r => r[0] === 0)).toHaveLength(2);
	});
});

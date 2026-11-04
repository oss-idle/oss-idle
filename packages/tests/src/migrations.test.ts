import { createRequire } from 'node:module';

import type {
	Database,
	SqlJsStatic,
} from 'sql.js';
import initSqlJs from 'sql.js';
import {
	beforeAll,
	describe,
	expect,
	it,
} from 'vitest';

import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { xpToLevel } from '@oss-idle/shared/xp';

import { migrate } from '@oss-idle/client/db/migrations';

const require = createRequire(import.meta.url);

let SQL: SqlJsStatic;

beforeAll(async () => {
	SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
});

/** How many migrations this branch found already applied - the database a player
 *  is upgrading from, with the guest lineage on positive ids, empty lifetime
 *  totals and scores graded with the old top letter. */
const APPLIED = 8;

/** `live` builds the table the current schema creates - the one a new player
 *  gets, with every column the migrations add already there. */
const database = (live = false): Database => {
	const db = new SQL.Database();
	const skillCols = Skills.flatMap(s => [
		`${s} INTEGER DEFAULT 0`,
		`${s}XP INTEGER DEFAULT 0`,
		`${s}Upgrades INTEGER DEFAULT 0`,
		`${s}Overdrive REAL DEFAULT 0`,
		`${s}Prestige INTEGER DEFAULT 0`,
		`${s}TotalXp INTEGER DEFAULT 0`,
		...live ? [`${s}LifetimeXp INTEGER DEFAULT 0`] : [],
	]);
	db.run(`CREATE TABLE character (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT,
		${skillCols.join(', ')},
		overallTotalXp INTEGER DEFAULT 0,
		overallLevel INTEGER DEFAULT 0,
		generation INTEGER DEFAULT 1,
		local INTEGER DEFAULT 0${live ? `, memoryResetAt INTEGER DEFAULT 0,
			memoryForgetAt TEXT NOT NULL DEFAULT '[]', current INTEGER DEFAULT 0` : ''}
	);`);
	db.run(`CREATE TABLE score (
		id INTEGER PRIMARY KEY AUTOINCREMENT, onlineId INTEGER DEFAULT -1,
		characterId INTEGER, beatmapId INTEGER, score INTEGER, accuracy REAL,
		grade TEXT, pp REAL, playedAt INTEGER
	);`);
	for (const best of ['score_best', 'score_best_pp'])
		db.run(`CREATE TABLE ${best} (
			characterId INTEGER NOT NULL, beatmapId INTEGER NOT NULL, scoreId INTEGER NOT NULL,
			PRIMARY KEY (characterId, beatmapId)
		);`);
	db.run(live ? `CREATE TABLE playlist_entry (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		playlistId INTEGER NOT NULL, beatmapId INTEGER NOT NULL, rate REAL NOT NULL DEFAULT 0,
		position INTEGER NOT NULL, repeat INTEGER NOT NULL DEFAULT 1, mods TEXT NOT NULL DEFAULT ''
	);` : `CREATE TABLE playlist_entry (
		playlistId INTEGER NOT NULL, beatmapId INTEGER NOT NULL,
		PRIMARY KEY (playlistId, beatmapId)
	);`);
	db.run('CREATE INDEX idx_playlist_entry_beatmap ON playlist_entry(beatmapId);');
	// a fresh database has run nothing yet and replays every migration
	db.run(`PRAGMA user_version = ${live ? 0 : APPLIED}`);
	return db;
};

const oldDatabase = () => database();
const freshDatabase = () => database(true);

const rows = (db: Database, sql: string) => db.exec(sql)[0]?.values ?? [];
const one = (db: Database, sql: string) => rows(db, sql)[0]?.[0];

describe('client database migrations', () => {
	it('replays every migration over the schema a new player is given', () => {
		const db = freshDatabase();
		db.run('INSERT INTO character (id, name, local) VALUES (1, \'Guest\', 1);');

		expect(() => migrate(db)).not.toThrow();

		expect(one(db, 'SELECT COUNT(*) FROM character')).toBe(1);
		// everything was recorded, so the next boot finds nothing left to do
		expect(migrate(db)).toBe(false);
	});

	it('moves the local lineage below zero, with its scores', () => {
		const db = oldDatabase();
		db.run('INSERT INTO character (id, name, local, generation) VALUES (1, \'Guest\', 1, 1);');
		db.run('INSERT INTO character (id, name, local, generation) VALUES (2, \'Second\', 1, 2);');
		// a cached server character keeping the same id as the second generation
		db.run('INSERT INTO character (id, name, local) VALUES (3, \'Online\', 0);');
		db.run(`INSERT INTO score (characterId, beatmapId, score, accuracy, grade, pp, playedAt)
			VALUES (1, 10, 900000, 0.98, 'S', 100, 1), (2, 10, 950000, 0.99, 'X', 120, 2),
				(3, 10, 990000, 0.995, 'X', 130, 3);`);

		migrate(db);

		expect(rows(db, 'SELECT id, name FROM character ORDER BY id')).toEqual([
			[-2, 'Second'], [-1, 'Guest'], [3, 'Online'],
		]);
		expect(rows(db, 'SELECT characterId FROM score ORDER BY characterId')).toEqual([
			[-2], [-1], [3],
		]);
		// the newest generation is the one that stays live across reloads
		expect(one(db, 'SELECT id FROM character WHERE current = 1')).toBe(-2);
	});

	it('backfills the lifetime totals the rebirth gate reads', () => {
		const db = oldDatabase();
		db.run(`INSERT INTO character (id, name, local, accuracy, accuracyXP, speed, speedXP)
			VALUES (1, 'Guest', 1, 40, 500, 30, 250);`);

		migrate(db);

		const expected = Math.round(xpToLevel(40) + 500);
		expect(one(db, 'SELECT accuracyTotalXp FROM character')).toBe(expected);
		expect(one(db, 'SELECT overallTotalXp FROM character'))
			.toBe(expected + Math.round(xpToLevel(30) + 250));
		expect(one(db, 'SELECT overallLevel FROM character') as number).toBeGreaterThan(0);
	});

	it('renames the old top grade and re-picks the best on accuracy', () => {
		const db = oldDatabase();
		db.run('INSERT INTO character (id, name, local) VALUES (1, \'Guest\', 1);');
		// same capped score, the divine one only wins on accuracy
		db.run(`INSERT INTO score (id, characterId, beatmapId, score, accuracy, grade, pp, playedAt)
			VALUES (1, 1, 10, 1000000, 1.0, 'X', 100, 1),
				(2, 1, 10, 1000000, 1.00667, 'Z', 100, 2);`);

		migrate(db);

		expect(rows(db, 'SELECT id, grade FROM score ORDER BY id')).toEqual([[1, 'X'], [2, 'XX']]);
		expect(one(db, 'SELECT scoreId FROM score_best')).toBe(2);
	});
	it('gives memory somewhere to record that its training was spent', () => {
		const db = oldDatabase();
		db.run('INSERT INTO character (id, name, local) VALUES (1, \'Guest\', 1);');
		db.run(`INSERT INTO score (id, characterId, beatmapId, score, accuracy, grade, pp, playedAt)
			VALUES (1, 1, 10, 900000, 0.98, 'S', 50, 100),
				(2, 1, 10, 950000, 0.99, 'S', 60, 500),
				(3, 1, 10, 980000, 0.99, 'S', 70, 1500);`);

		migrate(db);

		// nothing prestiged yet, so every play still trains
		expect(one(db, 'SELECT memoryResetAt FROM character WHERE id = -1')).toBe(0);
		const since = (t: number) => one(db,
			`SELECT COUNT(*) FROM score WHERE characterId = -1 AND beatmapId = 10 AND playedAt >= ${t}`);
		expect(since(0)).toBe(3);
		// after a reset the earlier plays stop counting, but the scores remain
		expect(since(1000)).toBe(1);
		expect(one(db, 'SELECT COUNT(*) FROM score')).toBe(3);
	});

	it('makes the memory upgrades already bought forget their plays', () => {
		const db = oldDatabase();
		db.run(`INSERT INTO character (id, name, local, memoryUpgrades)
			VALUES (1, 'Guest', 1, 2), (2, 'Other', 1, 0);`);

		migrate(db);

		const forgets = (id: number) => JSON.parse(String(one(db,
			`SELECT memoryForgetAt FROM character WHERE memoryUpgrades = ${id}`))) as number[];
		expect(forgets(2)).toHaveLength(2);
		expect(forgets(0)).toEqual([]);
	});

	it('keeps every playlist entry unlocked, in order, and lets copies sit beside it', () => {
		const db = oldDatabase();
		db.run('INSERT INTO playlist_entry (playlistId, beatmapId) VALUES (1, 11), (1, 10), (2, 10);');

		migrate(db);

		expect(rows(db, `SELECT playlistId, beatmapId, rate, repeat FROM playlist_entry
			ORDER BY position`)).toEqual([[1, 11, 0, 1], [1, 10, 0, 1], [2, 10, 0, 1]]);
		db.run(`INSERT INTO playlist_entry (playlistId, beatmapId, rate, position)
			VALUES (1, 10, 1.3, 4), (1, 10, 0, 5);`);
		expect(one(db, `SELECT COUNT(*) FROM playlist_entry
			WHERE playlistId = 1 AND beatmapId = 10`)).toBe(3);
		expect(one(db, `SELECT COUNT(*) FROM sqlite_master
			WHERE type = 'index' AND name = 'idx_playlist_entry_beatmap'`)).toBe(1);
	});

	it('moves each play\'s 4K gains into the per-skill JSON every ruleset writes', () => {
		const db = oldDatabase();
		db.run(`CREATE TABLE score_xp (
			scoreId INTEGER PRIMARY KEY, characterId INTEGER, beatmapId INTEGER, playedAt INTEGER,
			${Skills.map(s => `${s} REAL DEFAULT 0`).join(', ')}
		);`);
		db.run(`INSERT INTO score_xp (scoreId, characterId, beatmapId, playedAt, accuracy, speedjam)
			VALUES (1, 5, 10, 100, 120.5, 30), (2, 5, 11, 200, 0, 0);`);

		migrate(db);

		const gains = (id: number) =>
			JSON.parse(String(one(db, `SELECT gains FROM score_xp WHERE scoreId = ${id}`)));
		expect(gains(1)).toEqual({
			accuracy: 120.5, speedjam: 30, 
		});
		expect(gains(2)).toEqual({});
	});

	it('marks the copies of unranked boards\' plays by the id range they came from', () => {
		const db = oldDatabase();
		db.run(`INSERT INTO score (characterId, beatmapId, onlineId)
			VALUES (5, 10, -1), (5, 11, 42), (5, 12, 1500000007);`);

		migrate(db);

		expect(db.exec('SELECT onlineId, unranked FROM score ORDER BY id')[0].values)
			.toEqual([[-1, 0], [42, 0], [1500000007, 1]]);
	});
});

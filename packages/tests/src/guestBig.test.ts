import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';
import {
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
import Synced from '@oss-idle/shared/helpers/synced';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';

vi.hoisted(() => vi.stubGlobal('window', { addEventListener: () => {} }));
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: '' }));
vi.mock('../../client/src/rulesets/registry', () => ({
	selectedDef: () => ({}),
	selectedDefLoaded: () => ({ skills: Skills }),
	selectedProgression: () => undefined,
	selectedRuleset: { get: () => 'mania4k' },
}));
const live = vi.hoisted(() => ({ character: { get: (): unknown => undefined } }));
vi.mock('../../client/src/entity/entities', () => ({ default: live }));
vi.mock('../../client/src/online/client', () => ({ rpc: {} }));
vi.mock('../../client/src/online/services/characterAction', () => ({}));

const { DB } = await import('@oss-idle/client/db/dao');
const { default: Character } = await import('@oss-idle/client/db/schema/character');
const { prestigeSkill } = await import('@oss-idle/client/online/services/prestige');

const require = createRequire(import.meta.url);
let db: import('sql.js').Database;
const one = (sql: string) => db.exec(sql)[0]?.values[0][0];

beforeAll(async () => {
	const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
	db = new SQL.Database();
	db.run(Character.table.ddl());
	Object.assign(DB, {
		write: async <T>(fn: (d: typeof db) => T) => fn(db),
		read: async <T>(fn: (d: typeof db) => T) => fn(db),
		select: async (t: typeof Character.table, sql: string, params = []) => t.select(db, sql, params),
	});
});

describe('guest progression on Big', () => {
	it('prestiges a skill holding 1e30 XP back to nothing held', async () => {
		db.run(`INSERT INTO character
			(id, name, local, current, speedTotalXp, speedLifetimeXp, overallTotalXp)
			VALUES (-1, 'Guest', 1, 1, '1e30', '1e30', '1e30');`);
		const before = await Character.localCurrent();
		expect(before!.skills.find(s => s.name === 'speed')!.level.get()).toBeGreaterThan(1000);
		live.character.get = () => before;

		expect(await prestigeSkill('speed')).toBe(true);

		const after = await Character.localCurrent();
		const speed = after!.skills.find(s => s.name === 'speed')!;
		expect(speed.level.get()).toBe(0);
		expect(speed.xp.get().isZero()).toBe(true);
		expect(speed.prestige.get()).toBe(1);
		expect(one('SELECT speedTotalXp FROM character WHERE id = -1')).toBe('0');
		expect(one('SELECT overallTotalXp FROM character WHERE id = -1')).toBe('0');
		// lifetime never moves
		expect(one('SELECT speedLifetimeXp FROM character WHERE id = -1')).toBe('1e30');
	});

	it('fires a Synced Big once per value, not per object', async () => {
		const xp = new Synced(Big.from(5));
		let fired = 0;
		xp.forceSync(() => fired++);
		await xp.set(Big.from(5));
		await xp.set(Big.from('1e400'));
		await xp.set(Big.from('1e400'));
		// once on subscribing, once for the change
		expect(fired).toBe(2);
	});
});

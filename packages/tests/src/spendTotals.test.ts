import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import {
	Big,
	type BigLike,
	ZERO,
} from '@oss-idle/shared/big';
import {
	heldTotal,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import {
	performPrestige,
	performUpgrade,
	performUpgradeRevert,
} from '../../server/src/character/actions';
import {
	type ProfileRow,
	skillColumnsFor,
	skillOf,
} from '../../server/src/db/schema/character';
import type { ServerRuleset } from '../../server/src/rulesets/ruleset';

vi.mock('../../server/src/env', () => ({
	env: {}, apiBaseUrl: 'https://api', 
}));
vi.mock('../../server/src/redis', () => ({}));
vi.mock('../../server/src/queue', () => ({}));
vi.mock('../../server/src/db/stats', () => ({}));
vi.mock('../../server/src/rankings', () => ({ reindexCharacter: async () => {} }));

let row: Record<string, unknown> = {};
// every select resolves to the row; every update merges its set into it
const select: object = new Proxy({}, {
	get: (_, key) => key === 'then'
		? (resolve: (rows: unknown) => void) => resolve([{ ...row }])
		: () => select,
});
const tx = {
	select: () => select,
	update: () => ({
		set: (updates: Record<string, unknown>) => ({
			where: async () => {
				row = {
					...row, ...updates, 
				};
			},
		}),
	}),
};
vi.mock('../../server/src/db/client', () => ({
	db: {
		select: () => select,
		transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
	},
}));

const SKILLS = ['speed', 'memory'];
const r = {
	def: { skills: SKILLS }, profile: { id: 'id' },
} as unknown as ServerRuleset;

const skill = (total: Big, drift: BigLike) => {
	const { level, xp } = xpGivesLevel(total);
	return {
		level, xp, totalXp: heldTotal(level, xp).add(drift),
		lifetimeXp: ZERO, upgrades: 0, prestige: 0, overdrive: ZERO,
	};
};

/** The totals as set: each skill's from what it holds, the overall their sum. */
const expectHeld = () => {
	const p = row as ProfileRow;
	const totals = SKILLS.map(s => skillOf(p, s));
	for (const { level, xp, totalXp } of totals) expect(totalXp.eq(heldTotal(level, xp))).toBe(true);
	expect(p.overallTotalXp.eq(totals.reduce((sum, t) => sum.add(t.totalXp), ZERO))).toBe(true);
};

describe('spending sets the held totals, never subtracts', () => {
	for (const total of ['1e6', '1e30', '1e400']) {
		it(`upgrade, revert, prestige at ${total}`, async () => {
			const big = Big.from(total);
			// totals that drifted from what the skills hold: subtracting a spend would keep the drift
			row = {
				upgradesBought: 0,
				laddersCompleted: 0,
				overallTotalXp: Big.from(7),
				...skillColumnsFor('speed', skill(big, big.div(100))),
				...skillColumnsFor('memory', skill(big.div(3), 0)),
			};
			await performUpgrade(r, 1, 'speed');
			expect(skillOf(row as ProfileRow, 'speed').upgrades).toBe(1);
			expectHeld();

			await performUpgradeRevert(r, 1, 'speed');
			expect(skillOf(row as ProfileRow, 'speed').upgrades).toBe(0);
			expectHeld();

			await performPrestige(r, 1, 'speed', true);
			expect(skillOf(row as ProfileRow, 'speed').totalXp.eq(ZERO)).toBe(true);
			expectHeld();
		});
	}
});

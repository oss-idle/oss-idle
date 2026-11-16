import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';

vi.mock('@lingui/core/macro', () => ({
	t: (s: TemplateStringsArray, ...v: unknown[]) => String.raw({ raw: s }, ...v),
	ph: (o: Record<string, unknown>) => Object.values(o)[0],
}));
const skillName = (s: string) => s;
vi.mock('../../client/src/rulesets/registry', () => ({ selectedDef: () => ({ skillName }) }));
const character = { get: () => undefined };
vi.mock('../../client/src/entity/entities', () => ({ default: { character } }));

const { logLines, logPlayFinished } = await import('../../client/src/logs');

describe('#logs', () => {
	it('writes one level-up line per skill, however many levels the play crossed', () => {
		const beatmap = {
			set: {
				metadata: {
					artist: 'A', title: 'B',
				},
			},
			metadata: { version: 'Hard' },
		} as Parameters<typeof logPlayFinished>[1];
		logPlayFinished(
			{
				accuracy: 0.99, grade: 'S', playedAt: 0, rate: 1, mods: [], pp: 0,
			},
			beatmap,
			[{
				skill: 'speed',
				gained: Big.from('1e3000'),
				fromLevel: 10,
				fromXp: Big.from(0),
				toLevel: 5010,
				toXp: Big.from(0),
				levels: 5000,
			}],
		);
		const lines = logLines.get().map(l => l.text);
		expect(lines.filter(l => l.includes('reached level'))).toEqual(['speed reached level 5010!']);
		expect(lines[0]).toContain('+1.00e3000 speed');
		const xp = logLines.get()[0].parts?.find(p => p.kind === 'xp');
		expect(xp?.amount?.eq(Big.from('1e3000'))).toBe(true);
	});
});

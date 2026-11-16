import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';
import { rankScore } from '@oss-idle/shared/rankings';

import {
	readXp,
	storedXp,
} from '../../server/src/pendingXp';

/** What Lua's cjson does to a value it decodes and encodes again: numbers keep 14 digits. */
const fourteenDigits = (_key: string, v: unknown) =>
	typeof v === 'number' ? Number(v.toPrecision(14)) : v;
const throughCjson = (json: string): string => JSON.stringify(JSON.parse(json), fourteenDigits);

describe('pending play XP', () => {
	it('comes back whole through Lua', () => {
		const xp = {
			stamina: Big.from(2 ** 60 + 1e3), speed: Big.from('1.2345678901234567e305'),
		};
		const raw = throughCjson(JSON.stringify({
			characterId: 1, skillXp: storedXp(xp),
		}));
		const back = readXp((JSON.parse(raw) as { skillXp: Record<string, string> }).skillXp);
		expect(back.stamina.eq(xp.stamina)).toBe(true);
		expect(back.speed.eq(xp.speed)).toBe(true);
	});

	it('reads a play stored before as numbers', () => {
		expect(readXp({ stamina: 1234.5 }).stamina.toNumber()).toBe(1234.5);
	});
});

describe('rankScore', () => {
	it('keeps the order', () => {
		const scores = [0, 1, 2 ** 53, '1e300', '1e3000'].map(v => rankScore(Big.from(v)));
		for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
	});

	it('ties neighbours past 15 digits', () => {
		expect(rankScore(Big.from(2 ** 53 + 2))).toBe(rankScore(Big.from(2 ** 53)));
	});
});

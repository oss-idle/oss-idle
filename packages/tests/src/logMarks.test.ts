import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	logParts,
	mark,
	partStyle,
	unmarked,
} from '../../client/src/logMarks';

describe('#logs marks', () => {
	const text = `${mark('player', 'Lolita')} played ${mark('map', 'A - B [Hard')} `
		+ `${mark('mods', 'x0.85 +HR')}`
		+ `${mark('map', ']')} and got a ${mark('grade', 'S')} (${mark('pp', '234pp')}).`;

	it('reads back as plain text', () => {
		expect(unmarked(text)).toBe('Lolita played A - B [Hard x0.85 +HR] and got a S (234pp).');
	});

	it('cuts a sentence into its coloured pieces', () => {
		const parts = logParts(text);
		expect(parts.map(p => p.text).join('')).toBe(unmarked(text));
		expect(parts.filter(p => p.kind).map(p => `${p.kind}:${p.text}`)).toEqual([
			'player:Lolita', 'map:A - B [Hard', 'mods:x0.85 +HR', 'map:]', 'grade:S', 'pp:234pp',
		]);
		expect(partStyle({
			text: 'S', kind: 'grade',
		})).not.toEqual(partStyle({
			text: 'D', kind: 'grade',
		}));
		expect(partStyle({ text: ' played ' })).toBeUndefined();
	});

	it('colours XP by its size, as BigNum does', () => {
		const [xp] = logParts(mark('xp', '92.92k', 92_926));
		expect(xp).toEqual({
			text: '92.92k', kind: 'xp', amount: 92_926,
		});
		expect(unmarked(`+${mark('xp', '92.92k', 92_926)}`)).toBe('+92.92k');
		expect(partStyle(xp)?.color).toBeDefined();
		expect(partStyle({
			text: '3', kind: 'xp', amount: 3,
		})).toBeUndefined();
		expect(partStyle(xp)).not.toEqual(partStyle({
			text: '5.41M', kind: 'xp', amount: 5_412_000,
		}));
	});
});

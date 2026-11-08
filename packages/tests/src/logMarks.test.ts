import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	logParts,
	mark,
	partColor,
	unmarked,
} from '../../client/src/logMarks';

describe('#logs marks', () => {
	const text = `${mark('player', 'Lolita')} played ${mark('map', 'A - B [Hard')} ${mark('mods', 'x0.85 +HR')}`
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
		expect(partColor({
			text: 'S', kind: 'grade', 
		})).not.toBe(partColor({
			text: 'D', kind: 'grade', 
		}));
		expect(partColor({ text: ' played ' })).toBeUndefined();
	});
});

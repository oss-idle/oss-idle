import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	parseSlot,
	slotOf,
} from '../../server/src/slot';

describe('play slots', () => {
	it('keys 4K by the bare character id, as before rulesets played side by side', () => {
		expect(slotOf(42, 'mania4k')).toBe('42');
		expect(parseSlot(slotOf(42, 'mania4k'))).toEqual({
			characterId: 42, ruleset: 'mania4k',
		});
	});

	it('keeps another ruleset of the same character apart', () => {
		expect(slotOf(42, 'mania7k')).not.toBe(slotOf(42, 'mania4k'));
		expect(parseSlot(slotOf(42, 'osu'))).toEqual({
			characterId: 42, ruleset: 'osu',
		});
	});
});

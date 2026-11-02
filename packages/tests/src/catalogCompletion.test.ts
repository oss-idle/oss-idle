import {
	describe,
	expect,
	it,
} from 'vitest';

import catalogCompletion from '../../client/catalogCompletion';

const HEADER = 'msgid ""\nmsgstr ""\n"Language: ru\\n"\n';
const entry = (id: string, text: string) => `#: src/a.tsx\nmsgid "${id}"\nmsgstr "${text}"\n`;
const catalog = (...entries: string[]) => [HEADER, ...entries].join('\n');

describe('catalogCompletion', () => {
	it('counts translated entries, not the header', () => {
		expect(catalogCompletion(catalog(entry('a', 'A'), entry('b', '')))).toBe(50);
		expect(catalogCompletion(catalog(entry('a', 'A')))).toBe(100);
		expect(catalogCompletion(catalog(entry('a', '')))).toBe(0);
	});

	it('rounds down, so a nearly done catalog never reads as done', () => {
		const entries = Array.from({ length: 999 }, (_, i) => entry(`s${i}`, 'x'));
		expect(catalogCompletion(catalog(...entries, entry('last', '')))).toBe(99);
	});

	it('reads a wrapped translation as translated', () => {
		const wrapped = 'msgid "long"\nmsgstr ""\n"une longue "\n"traduction"\n';
		expect(catalogCompletion(catalog(wrapped, entry('b', '')))).toBe(50);
	});

	it('takes a wrapped source for one entry', () => {
		const wrapped = 'msgid ""\n"a long "\n"source"\nmsgstr ""\n';
		expect(catalogCompletion(catalog(wrapped, entry('b', 'B')))).toBe(50);
	});

	it('has nothing to count in an empty catalog', () => {
		expect(catalogCompletion(HEADER)).toBe(0);
	});
});

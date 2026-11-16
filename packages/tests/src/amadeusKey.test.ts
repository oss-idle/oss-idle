import {
	describe,
	expect,
	it,
} from 'vitest';

import { keyMatches } from '../../server/src/auth/amadeus';

describe('the sign-in key of Amadeus', () => {
	const key = 'a'.repeat(40);

	it('accepts the key the server holds', () => {
		expect(keyMatches(key, key)).toBe(true);
	});

	it('refuses another key of the same length', () => {
		expect(keyMatches(`${'a'.repeat(39)}b`, key)).toBe(false);
	});

	it('refuses a shorter or longer key instead of throwing', () => {
		expect(keyMatches('a', key)).toBe(false);
		expect(keyMatches(`${key}a`, key)).toBe(false);
	});

	it('refuses an empty key', () => {
		expect(keyMatches('', key)).toBe(false);
	});
});

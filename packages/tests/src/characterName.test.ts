import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	lookalike,
	nameKey,
} from '@oss-idle/shared/lookalike';
import { characterNameBody } from '@oss-idle/shared/onboarding';
import { usesReservedOld } from '@oss-idle/shared/rebirth';

const ok = (name: string) => characterNameBody.safeParse({ name }).success;

describe('characterName width', () => {
	it('takes 32 Latin letters, 16 CJK or emoji', () => {
		expect(ok('W'.repeat(32))).toBe(true);
		expect(ok('漢'.repeat(16))).toBe(true);
		expect(ok('漢'.repeat(17))).toBe(false);
		expect(ok('😀'.repeat(16))).toBe(true);
		expect(ok('👨‍👩‍👧‍👦')).toBe(true);
	});

	it('takes accents and scripts that stack a few marks', () => {
		expect(ok('Ệ́')).toBe(true);
		expect(ok('กิ่')).toBe(true);
		expect(ok('क्ष्म')).toBe(true);
	});

	it('refuses zalgo and overwide characters', () => {
		expect(ok('R̸̛̘͍̹̟̲̼͓̙̤̰̗͎̓̈́̓̈́̓̈́̓R̸̛̘͍̹̟')).toBe(false);
		expect(ok('﷽')).toBe(false);
		expect(ok('a\u{1242B}')).toBe(false);
	});
});

describe('characterName invisible characters', () => {
	it('refuses bidi, zero-width, filler and odd spaces inside a name', () => {
		expect(ok('Adri\u202ErdA')).toBe(false);
		expect(ok('Ad\u200Bri')).toBe(false);
		expect(ok('Ad\u3164ri')).toBe(false);
		expect(ok('Ad\u00A0ri')).toBe(false);
		expect(ok('Ad\u2800ri')).toBe(false);
	});

	it('takes spaces and the joiners emoji are built with', () => {
		expect(ok('R3D Voltex')).toBe(true);
		expect(ok('\u2764\uFE0F')).toBe(true);
		expect(ok('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}')).toBe(true);
		expect(ok('\u{1F1EB}\u{1F1F7}')).toBe(true);
		expect(ok('1\uFE0F\u20E3')).toBe(true);
		expect(ok('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}')).toBe(true);
	});
});

describe('nameKey', () => {
	it('reads lookalikes as the name they copy', () => {
		expect(nameKey('\u0410dri')).toBe(nameKey('Adri'));
		expect(nameKey('Ad\u200Bri')).toBe(nameKey('adri'));
		expect(nameKey('\uFF21dri')).toBe(nameKey('Adri'));
		expect(nameKey('Adr1')).not.toBe(nameKey('Adri'));
	});

	it('sees a disguised _old', () => {
		expect(usesReservedOld(lookalike('Adri\uFF3Fold'), 'Adri')).toBe(true);
		expect(usesReservedOld(lookalike('Adri_\u03BFld'), 'Adri')).toBe(true);
		expect(usesReservedOld(lookalike('Adri_\u200Bold'), 'Adri')).toBe(true);
	});
});

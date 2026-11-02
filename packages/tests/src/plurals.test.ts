import { readFileSync } from 'node:fs';

import {
	i18n,
	setupI18n,
} from '@lingui/core';
import { compileMessage } from '@lingui/message-utils/compileMessage';
import {
	beforeAll,
	describe,
	expect,
	it,
} from 'vitest';

import { timeAgo } from '@oss-idle/shared/display/ago';
import { SUPPORTED_LOCALES } from '@oss-idle/shared/i18n/locales';
import { medalText } from '@oss-idle/shared/rulesets/mania/medalText';

const render = (locale: string, message: string, values: Record<string, unknown>) => {
	const instance = setupI18n();
	instance.load(locale, { k: compileMessage(message) });
	instance.activate(locale);
	return instance._('k', values);
};

const VALUES = {
	count: 21, n: 21, d: 21, h: 21, m: 21, s: 21, mo: 21, y: 21, hours: 21, nbMaps: 21,
	total: 21, shown: 3, holders: 21, bonus: 1, slots: 2, days: 1.5, months: 21, years: 21,
	online: 21, selected: 21, multiplier: '1.20', level: 100, size: '4 GB', bpm: 180, share: '2%', map: 'map',
};

/** The translated plurals of a catalog: `msgstr`, or its `msgid` in the source catalog. */
const plurals = (pkg: string, locale: string) => {
	const url = new URL(`../../${pkg}/src/locales/${locale}.po`, import.meta.url);
	const po = readFileSync(url, 'utf8');
	return [...po.matchAll(/^msgid "(.*, plural.*)"\nmsgstr "(.*)"$/gm)]
		.map(m => m[2].replaceAll('\\"', '"'))
		.filter(Boolean);
};

describe('plurals', () => {
	beforeAll(() => {
		i18n.load('en', {});
		i18n.activate('en');
	});

	it.each(['shared', 'client', 'web'].flatMap(pkg => SUPPORTED_LOCALES.map(locale => [pkg, locale])))(
		'%s %s: every plural renders',
		(pkg, locale) => {
			const messages = plurals(pkg, locale);
			if (locale === 'en') expect(messages.length).toBeGreaterThan(0);
			for (const message of messages) {
				expect(render(locale, message, VALUES), message).not.toContain('{');
			}
		},
	);

	it('gives Russian its three endings', () => {
		const files = '{count, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}';
		const ending = (count: number) => render('ru', files, { count });
		expect([1, 21].map(ending)).toEqual(['1 файл', '21 файл']);
		expect([2, 4, 22].map(ending)).toEqual(['2 файла', '4 файла', '22 файла']);
		expect([5, 11, 14, 25].map(ending))
			.toEqual(['5 файлов', '11 файлов', '14 файлов', '25 файлов']);
	});

	it('counts a medal, and keeps the # of #1', () => {
		const { description } = medalText('', {
			inName: () => undefined,
			name: skill => skill,
		});
		expect(description('first-50')).toBe('Hold #1 on 50 ranked maps');
		expect(description('hits-1k')).toBe('Hit 1,000 notes');
	});

	it('says one second, not one seconds', () => {
		expect(timeAgo(1000)).toBe('1 second ago');
		expect(timeAgo(45_000)).toBe('45 seconds ago');
	});
});

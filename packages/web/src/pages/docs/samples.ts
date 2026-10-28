// Prism first: its language components register on the global it sets
import 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';

import Prism from 'prismjs';

import type { Sample } from './content';

/** The two languages of osu!'s examples. */
export const LANGUAGES = ['bash', 'javascript'] as const;
export type Language = typeof LANGUAGES[number];

const AUTH = { Authorization: 'Bearer {{token}}' };
const JSON_HEADERS = {
	'Content-Type': 'application/json', Accept: 'application/json',
};
const FORM_HEADERS = {
	Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
};

const headersOf = (s: Sample): Record<string, string> => s.form
	? FORM_HEADERS
	: {
		...s.token === false ? {} : AUTH, ...JSON_HEADERS,
	};

const withQuery = (s: Sample) => s.query ? `${s.url}?${new URLSearchParams(s.query)}` : s.url;

const bash = (s: Sample) => [
	`curl --request ${s.method} \\`,
	s.method === 'GET' ? `    --get "${withQuery(s)}" \\` : `    "${withQuery(s)}" \\`,
	...Object.entries(headersOf(s)).map(([k, v]) => `    --header "${k}: ${v}" \\`),
	...s.form ? [`    --data "${new URLSearchParams(s.form)}"`] : [],
	...s.json === undefined ? [] : [`    --data '${JSON.stringify(s.json, undefined, 4)}'`],
].join('\n').replace(/ \\$/, '');

const object = (o: Record<string, string>) =>
	`{\n${Object.entries(o).map(([k, v]) => `    "${k}": "${v}",`).join('\n')}\n}`;

const bodyLine = (s: Sample) => s.form
	? '\n    body,'
	: s.json === undefined ? '' : '\n    body: JSON.stringify(body),';

const javascript = (s: Sample) => [
	`const url = new URL(\n    "${s.url}"\n);`,
	...s.query ? [[
		`const params = ${object(s.query)};`,
		'Object.keys(params)',
		'    .forEach(key => url.searchParams.append(key, params[key]));',
	].join('\n')] : [],
	`const headers = ${object(headersOf(s))};`,
	...s.form ? [`let body = "${new URLSearchParams(s.form)}";`] : [],
	...s.json === undefined ? [] : [`let body = ${JSON.stringify(s.json, undefined, 4)};`],
	`fetch(url, {\n    method: "${s.method}",\n    headers,${bodyLine(s)}\n}).then(response => response.json());`,
].join('\n\n');

/** A request as highlighted HTML, in the picked language. */
export const requestHtml = (s: Sample, language: Language) => language === 'bash'
	? Prism.highlight(bash(s), Prism.languages.bash, 'bash')
	: Prism.highlight(javascript(s), Prism.languages.javascript, 'javascript');

export const jsonHtml = (value: unknown) =>
	Prism.highlight(JSON.stringify(value, undefined, 4), Prism.languages.json, 'json');

export const highlight = (code: string, language: Language) =>
	Prism.highlight(code, Prism.languages[language], language);

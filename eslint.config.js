import stylistic from '@stylistic/eslint-plugin';
import importNewlines from 'eslint-plugin-import-newlines';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

// Lines exempt from max-len: a lone <Trans>, a `t` i18n template, single string
// declarations, a line holding one string (long prose in a list), and pure prose/JSX-text lines (the interior of a multiline
// <Trans> - matched by shape since max-len can't see across lines). All of it
// untranslatable text we can't reflow anyway.
const maxLenIgnore = [
	'^\\t*<Trans>.*</Trans>$',
	't`.*`,?$',
	'`.*`,?$',
	'^\\t*([\'"]).*\\1,?$',
	'^\\t*(?:const|let|var) \\w+ = ([`\'"]).*\\1;?$',
	'^\\t*[^{}();=]*[A-Za-z][^{}();=]*$',
	'.*InferResponseType.*',
	'.*throw new.*',
	'^\\t*return `.*`;$',
].join('|');

export default tseslint.config(
	{
		ignores: [
			'.claude/**',
			'**/dist/**',
			'**/node_modules/**',
			'**/out/**',
			'**/build/**',
			'**/release/**',
			// the staging desktop app's build (idle dev)
			'**/dist.staging/**',
			'**/dist.e2e/**',
			'**/release-staging/**',
			'**/coverage/**',
			'**/*.min.js',
			'packages/client/public/**',
			'packages/client/osu!design/**',
			'packages/server/drizzle/**',
			'packages/shared/src/locales/*.ts',
			'packages/e2e/playwright-report/**',
			'packages/e2e/test-results/**',
			// gitignored notes and mockups
			'spec/**',
		],
	},
	...tseslint.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				// One config for the whole monorepo; pin the root so the parser
				// doesn't have to guess between candidate package roots.
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			'@stylistic': stylistic,
			'import-newlines': importNewlines,
			'simple-import-sort': simpleImportSort,
		},
		rules: {
			'import-newlines/enforce': ['error', { items: 1 }],
			// side effects first (in their own order: CSS cascades by it), then node's,
			// other packages, each of ours, and relative imports last
			'simple-import-sort/imports': ['error', {
				groups: [
					['^\\u0000'],
					['^node:'],
					['^(?!@oss-idle/)@?\\w'],
					...['shared', 'server', 'client', 'web', 'tests', 'e2e', 'desktop', 'discord']
						.map(name => [`^@oss-idle/${name}(/|$)`]),
					['^\\.'],
				],
			}],
			'@stylistic/indent': ['error', 'tab'],
			'@stylistic/semi': 'error',
			'@stylistic/quotes': ['error', 'single'],
			'@stylistic/max-len': ['error', {
				'code': 100,
				'tabWidth': 0,
				'ignorePattern': maxLenIgnore,
				'ignoreComments': true,
				'ignoreUrls': true,
			}],
			'no-tabs': 'off',
			'complexity': ['error', { 'max': 14 }],
			'comma-dangle': ['error', 'always-multiline'],
			'object-curly-spacing': ['error', 'always'],
			'object-curly-newline': [
				'error',
				{
					ObjectExpression: {
						multiline: true,
						minProperties: 2,
					},
				},
			],
		},
	},
	{
		// The level -> skill mapping paces the strain curves and nothing else.
		// The player is shown their effective level, so the mapped number must
		// never reach a screen: it only means something to the tuning.
		files: ['packages/client/src/**', 'packages/web/src/**'],
		rules: {
			'no-restricted-imports': ['error', {
				paths: [{
					name: '@oss-idle/shared/rulesets/mania/4k/skills/levelCurve',
					importNames: ['mapLevel', 'LEVEL_MAPPING'],
					message: 'gameplay skill is internal to the sim - show effectiveLevelOf instead',
				}],
			}],
		},
	},
);

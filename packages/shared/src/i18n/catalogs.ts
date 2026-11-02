import type { Messages } from '@lingui/core';

import type { Locale } from './locales.js';

/**
 * Lazy loaders for the shared package's own compiled catalog, one per locale.
 * Every consumer (both frontends, and the server once it serves more than
 * English) loads this alongside its own catalog so strings owned by `shared`
 * - e.g. skill names from `display/skills.ts` - resolve on its i18n instance.
 *
 * Each entry is a dynamic import so bundlers emit one chunk per locale
 * only the active language is downloaded. Keep it in sync with {@link Locale}.
 */
export const sharedCatalog: Record<Locale, () => Promise<Messages>> = {
	en: () => import('../locales/en.js').then(m => m.messages),
	de: () => import('../locales/de.js').then(m => m.messages),
	es: () => import('../locales/es.js').then(m => m.messages),
	fil: () => import('../locales/fil.js').then(m => m.messages),
	fr: () => import('../locales/fr.js').then(m => m.messages),
	ru: () => import('../locales/ru.js').then(m => m.messages),
	vi: () => import('../locales/vi.js').then(m => m.messages),
};

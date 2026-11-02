import { i18n } from '@lingui/core';

import { sharedCatalog } from '@oss-idle/shared/i18n/catalogs';
import type { Locale } from '@oss-idle/shared/i18n/locales';
import { loadAndActivate } from '@oss-idle/shared/i18n/runtime';

/**
 * Load this locale's catalogs and activate them on the shared `i18n` singleton:
 * the web app's own strings plus the catalog owned by `@oss-idle/shared` (skill
 * names etc.). Both are dynamic imports, so the browser downloads only the
 * language actually in use - not every supported catalog.
 */
export async function activateLocale(locale: Locale): Promise<void> {
	const [shared, { messages: app }] = await Promise.all([
		sharedCatalog[locale](),
		import(`./locales/${locale}.po`),
	]);
	loadAndActivate(i18n, locale, shared, app);
	document.documentElement.lang = locale;
}

export { i18n };

import {
	detectBrowserLocale,
	isLocale,
	type Locale,
} from '@oss-idle/shared/i18n/locales';

/** The game's own `language` setting: same origin, so the site and the game share one choice. */
const KEY = 'language';

export function savedLocale(): Locale {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '""');
		if (typeof saved === 'string' && isLocale(saved)) return saved;
	} catch { /* storage blocked or bad value */ }
	return detectBrowserLocale();
}

export function saveLocale(locale: Locale): void {
	try { localStorage.setItem(KEY, JSON.stringify(locale)); } catch { /* storage blocked */ }
}

/**
 * The set of locales the whole app supports. This is the single source of truth
 * shared by every package: the server negotiates against it, the two frontends
 * load catalogs for it, and the CLI extracts catalogs for exactly these.
 */
export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fil', 'fr', 'ru', 'vi'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

/** English is the source locale - message text is authored inline in English. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Human-readable names, shown in a language picker (in their own language). */
export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch',
	es: 'Español',
	fil: 'Filipino',
	fr: 'Français',
	ru: 'Русский',
	vi: 'Tiếng Việt',
};

export function isLocale(value: string): value is Locale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * First supported locale in a preference-ordered list of BCP-47 tags, matched by
 * primary subtag (so `fr-CA` matches `fr`). Falls back to DEFAULT_LOCALE
 * Backs both browser detection ({@link detectBrowserLocale}) and server-side
 * `Accept-Language` negotiation ({@link negotiateLocale}).
 */
export function resolveLocale(preferred: readonly string[]): Locale {
	for (const tag of preferred) {
		const base = tag.split('-')[0].trim().toLowerCase();
		if (isLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}

/**
 * Best supported locale for an `Accept-Language` header value.
 * Quality weights (`;q=`) are not honoured yet - first supported match wins.
 */
export function negotiateLocale(acceptLanguage?: string | null): Locale {
	if (!acceptLanguage) return DEFAULT_LOCALE;
	return resolveLocale(acceptLanguage.split(',').map(part => part.split(';')[0]));
}

/**
 * Best supported locale for the user's browser language preferences
 * (`navigator.languages`, most-preferred first). Returns {@link DEFAULT_LOCALE}
 * outside a browser, so it's safe to reference from isomorphic code.
 */
export function detectBrowserLocale(): Locale {
	if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
	const preferred = navigator.languages?.length ? 
		navigator.languages 
		: [navigator.language];
	return resolveLocale(preferred);
}

import { __ } from '../i18n/translate.js';

// These helpers translate on the `@lingui/core` singleton (`__`'s default)
// rather than a per-request instance: they are frontend-only display text, and
// both frontends activate their locale on the singleton (see i18n/runtime.ts).
// Server code must not use them - it localises per request.

/**
 * osu-style relative play time, shown only for plays within the last 3 days:
 *   0–59s · 1–59mn · 1–48h · 2d/3d. Returns null when older (no label).
 */
export const recentTimeAgo = (ms: number): string | null => {
	const s = Math.floor(ms / 1000);
	if (s < 0) return null;
	if (s < 60) return __('{s}s', undefined, { s });
	const m = Math.floor(s / 60);
	if (m < 60) return __('{m}mn', undefined, { m });
	const h = Math.floor(m / 60);
	if (h < 48) return __('{h}h', undefined, { h });
	const d = Math.floor(h / 24);
	if (d <= 3) return __('{d}d', undefined, { d });
	return null;
};

/**
 * Coarse relative time, one unit, rounded down. Each unit hands off to the
 * next at twice its base so there is never a "1 unit ago" (except seconds):
 *   0–119s · 2–119mn · 2–47h · 2–59d · 2–23mo · 2+y.
 */
export const timeAgo = (ms?: number | null): string => {
	if (!ms) return '';
	const s = Math.floor(ms / 1000);
	if (s < 120) return __('{s, plural, one {# second ago} other {# seconds ago}}', undefined, { s });
	const m = Math.floor(s / 60);
	if (m < 120) return __('{m, plural, one {# minute ago} other {# minutes ago}}', undefined, { m });
	const h = Math.floor(m / 60);
	if (h < 48) return __('{h, plural, one {# hour ago} other {# hours ago}}', undefined, { h });
	const d = Math.floor(h / 24);
	if (d < 60) return __('{d, plural, one {# day ago} other {# days ago}}', undefined, { d });
	const mo = Math.floor(d / 30);
	if (mo < 24) return __('{mo, plural, one {# month ago} other {# months ago}}', undefined, { mo });
	const y = Math.floor(mo / 12);
	return __('{y, plural, one {# year ago} other {# years ago}}', undefined, { y });
};

export const dateAgo = (date?: string | number | null): string => {
	if (!date) return '';
	return timeAgo(Date.now() - new Date(date).getTime());
};

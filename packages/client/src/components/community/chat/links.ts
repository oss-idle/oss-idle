/** A difficulty a chat line points at, as its set's web page names it. */
export type MapRef = { setId: number, beatmapId: number };

/** A run of chat text, a web address in it with the URL it opens, or a map. */
export type ChatPart = string | { text: string, url: string } | { text: string, map: MapRef };

/** `[url label]` for a difficulty's page on the site, as /np sends it. The label
 *  may hold one level of brackets: "Artist - Title [Insane]". */
const MAP_RE = /\[https?:\/\/[^\s\]]+\/web\/maps\/(\d+)\?diff=(\d+) ((?:[^[\]]|\[[^[\]]*\])+)\]/g;

export const mapLink = (site: string, map: MapRef, label: string): string => (
	`[${site}/web/maps/${map.setId}?diff=${map.beatmapId} ${label}]`
);

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const OPENERS: Record<string, string> = {
	')': '(', ']': '[', '}': '{', 
};

const count = (s: string, c: string): number => s.split(c).length - 1;

/** Drops what ends the sentence rather than the address: trailing punctuation,
 *  and a closing bracket the address never opened. */
const trimEnd = (raw: string): string => {
	let s = raw;
	for (;;) {
		const last = s.slice(-1);
		const opener = OPENERS[last];
		if ('.,!?;:'.includes(last)) s = s.slice(0, -1);
		else if (opener && count(s, last) > count(s, opener)) s = s.slice(0, -1);
		else return s;
	}
};

/** The address as a browser opens it, punycoded so a lookalike host shows. */
const toUrl = (text: string): string | undefined => {
	try {
		const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
		return url.hostname.includes('.') ? url.href : undefined;
	} catch {
		return undefined;
	}
};

/** Splits a chat message around the maps and the http(s) and www. addresses it
 *  contains. A map's host is never opened, only its ids are read. */
export function splitLinks(text: string): ChatPart[] {
	const parts: ChatPart[] = [];
	let at = 0;
	for (const match of text.matchAll(MAP_RE)) {
		parts.push(...splitUrls(text.slice(at, match.index)));
		parts.push({
			text: match[3],
			map: {
				setId: Number(match[1]), beatmapId: Number(match[2]),
			},
		});
		at = match.index + match[0].length;
	}
	parts.push(...splitUrls(text.slice(at)));
	return parts;
}

/** The message as it reads in chat, a map shown by its label: for a popup,
 *  which shows text only. */
export const plainText = (text: string): string => splitLinks(text)
	.map(part => typeof part === 'string' ? part : part.text)
	.join('');

/** The text that may mention someone: without its maps, its addresses and the `quiet` parts. */
export const mentionableText = (text: string, quiet: string[] = []): string => quiet.reduce(
	(rest, part) => rest.split(part).join(' '),
	splitLinks(text).map(part => typeof part === 'string' ? part : ' ').join(''),
);

function splitUrls(text: string): ChatPart[] {
	const parts: ChatPart[] = [];
	let at = 0;
	for (const match of text.matchAll(URL_RE)) {
		const shown = trimEnd(match[0]);
		const url = toUrl(shown);
		if (!url) continue;
		if (match.index > at) parts.push(text.slice(at, match.index));
		parts.push({
			text: shown, url, 
		});
		at = match.index + shown.length;
	}
	if (at < text.length) parts.push(text.slice(at));
	return parts;
}

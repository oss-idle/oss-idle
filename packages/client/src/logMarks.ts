import type { CSSProperties } from 'react';

import { bigStyle } from '@oss-idle/shared/display/bigTheme';

/** What a coloured piece of a #logs line is. */
export type LogKind = 'player' | 'map' | 'mods' | 'acc' | 'grade' | 'pp' | 'xp' | 'skill' | 'level';

/** A piece of a #logs line: plain text, or a value of some kind, with the number behind it
 *  when its colour follows its size. */
export type LogPart = { text: string, kind?: LogKind, amount?: number };

// private-use characters: never typed, kept by translations as part of the value
const OPEN = '\u{E000}';
const SPLIT = '\u{E001}';
const CLOSE = '\u{E002}';
// kind, amount (may be empty), text
const MARK = new RegExp(
	`${OPEN}([a-z]+)${SPLIT}([^${SPLIT}]*)${SPLIT}([^${CLOSE}]*)${CLOSE}`, 'gu',
);

/** `text` tagged as `kind`, to go into a translated sentence as a placeholder; `amount` is
 *  the number it shows, for a colour by size. */
export const mark = (kind: LogKind, text: string, amount?: number): string =>
	`${OPEN}${kind}${SPLIT}${amount ?? ''}${SPLIT}${text}${CLOSE}`;

/** A marked sentence cut into its pieces. */
export const logParts = (text: string): LogPart[] => {
	const parts: LogPart[] = [];
	let from = 0;
	for (const m of text.matchAll(MARK)) {
		if (m.index > from) parts.push({ text: text.slice(from, m.index) });
		parts.push({
			text: m[3], kind: m[1] as LogKind, ...m[2] && { amount: Number(m[2]) },
		});
		from = m.index + m[0].length;
	}
	if (from < text.length) parts.push({ text: text.slice(from) });
	return parts;
};

/** A marked sentence as plain text. */
export const unmarked = (text: string): string => text.replace(MARK, '$3');

const GRADE_COLOR: Partial<Record<string, string>> = {
	XX: '#ff66ab', X: '#ffe066', SS: '#ffd34d', S: '#ffb84d',
	A: '#88da20', B: '#4fb3ff', C: '#c77dff', D: '#ff5a5a', F: '#9a9a9a',
};

const KIND_COLOR: Record<Exclude<LogKind, 'xp'>, string> = {
	player: '#ff8fc6',
	map: '#8cc8ff',
	mods: '#c9a2ff',
	acc: '#ffffff',
	grade: '#ffffff',
	pp: '#ffcc22',
	skill: '#7fe0e6',
	level: '#b6f5c4',
};

/** How a piece is drawn; plain text keeps the line's own colour. XP is coloured by its
 *  size, as BigNum draws it everywhere else. */
export const partStyle = (part: LogPart): CSSProperties | undefined => {
	if (!part.kind) return undefined;
	if (part.kind === 'xp') return bigStyle(part.amount ?? 0, 'heat');
	if (part.kind === 'grade') return { color: GRADE_COLOR[part.text] ?? KIND_COLOR.grade };
	return { color: KIND_COLOR[part.kind] };
};

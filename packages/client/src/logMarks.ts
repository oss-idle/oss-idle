/** What a coloured piece of a #logs line is. */
export type LogKind = 'player' | 'map' | 'mods' | 'acc' | 'grade' | 'pp' | 'xp' | 'skill' | 'level';

/** A piece of a #logs line: plain text, or a value of some kind. */
export type LogPart = { text: string, kind?: LogKind };

// private-use characters: never typed, kept by translations as part of the value
const OPEN = '\u{E000}';
const SPLIT = '\u{E001}';
const CLOSE = '\u{E002}';
const MARK = new RegExp(`${OPEN}([a-z]+)${SPLIT}([^${CLOSE}]*)${CLOSE}`, 'gu');

/** `value` tagged as `kind`, to go into a translated sentence as a placeholder. */
export const mark = (kind: LogKind, value: string): string =>
	`${OPEN}${kind}${SPLIT}${value}${CLOSE}`;

/** A marked sentence cut into its pieces. */
export const logParts = (text: string): LogPart[] => {
	const parts: LogPart[] = [];
	let from = 0;
	for (const m of text.matchAll(MARK)) {
		if (m.index > from) parts.push({ text: text.slice(from, m.index) });
		parts.push({
			text: m[2], kind: m[1] as LogKind, 
		});
		from = m.index + m[0].length;
	}
	if (from < text.length) parts.push({ text: text.slice(from) });
	return parts;
};

/** A marked sentence as plain text. */
export const unmarked = (text: string): string => text.replace(MARK, '$2');

const GRADE_COLOR: Partial<Record<string, string>> = {
	XX: '#ff66ab', X: '#ffe066', SS: '#ffd34d', S: '#ffb84d',
	A: '#88da20', B: '#4fb3ff', C: '#c77dff', D: '#ff5a5a', F: '#9a9a9a',
};

const KIND_COLOR: Record<LogKind, string> = {
	player: '#ff8fc6',
	map: '#8cc8ff',
	mods: '#c9a2ff',
	acc: '#ffffff',
	grade: '#ffffff',
	pp: '#ffcc22',
	xp: '#81fa9b',
	skill: '#7fe0e6',
	level: '#b6f5c4',
};

/** The colour a piece is drawn in; plain text keeps the line's own. */
export const partColor = (part: LogPart): string | undefined => part.kind && (part.kind === 'grade'
	? GRADE_COLOR[part.text] ?? KIND_COLOR.grade
	: KIND_COLOR[part.kind]);

/** A keyword's text in a .po entry: its quoted lines, joined (long strings can wrap). */
const poText = (entry: string, keyword: string): string => {
	const lines = new RegExp(`^${keyword} ((?:".*"\\n?)+)`, 'm').exec(entry)?.[1] ?? '';
	return [...lines.matchAll(/"(.*)"/g)].map(m => m[1]).join('');
};

/** The whole percent of a .po catalog that is translated, rounded down: 99.9% isn't done. */
export default function catalogCompletion(po: string): number {
	const entries = po.split(/\n\s*\n/).filter(entry => poText(entry, 'msgid'));
	if (!entries.length) return 0;
	const done = entries.filter(entry => poText(entry, 'msgstr')).length;
	return Math.floor(done * 100 / entries.length);
}

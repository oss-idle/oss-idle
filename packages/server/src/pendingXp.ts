import {
	type Big,
	fromWire,
	toText,
} from '@oss-idle/shared/big';

/** A pending play's XP as Redis keeps it: text forms, which Lua's cjson passes through whole. */
export const storedXp = (xp: Record<string, Big>): Record<string, string> =>
	Object.fromEntries(Object.entries(xp).map(([skill, v]) => [skill, toText(v)]));

/** Plays stored before XP was text hold numbers. */
export const readXp = (xp: Record<string, number | string>): Record<string, Big> =>
	Object.fromEntries(Object.entries(xp).map(([skill, v]) => [skill, fromWire(v)]));

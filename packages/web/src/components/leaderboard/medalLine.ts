import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { fromWire } from '@oss-idle/shared/big';
import { formatBig } from '@oss-idle/shared/display/num';
import { overdriveText } from '@oss-idle/shared/display/overdrive';

export type Goal = { id: string, goal: number };

export const LINE_NAMES: Record<string, MessageDescriptor> = {
	plays: msg`Play count`,
	hits: msg`Notes hit`,
	time: msg`Hours played`,
	friends: msg`Followers`,
	overdrive: msg`Highest overdrive`,
	prestige: msg`Prestiges`,
	first: msg`#1 ranks`,
	curator: msg`Proposed maps ranked`,
	mapper: msg`Mapped sets ranked or loved`,
};

/** A counter as the API sends it: a number below 2^53, text above. */
export type LineValue = number | string;

export const lineValue = (line: string, value: LineValue): string => {
	const big = fromWire(value);
	return line === 'overdrive' ? overdriveText(big)
		: line === 'time' ? `${formatBig(big)}h`
			: formatBig(big);
};

/** `part` of `whole` as a CSS width, for a bar. */
export const lineShare = (part: LineValue, whole: number): string =>
	`${fromWire(part).div(whole).toNumber() * 100}%`;

/** Whether the counter now is under its best. */
export const isBelowBest = (
	{ current, value }: { current: LineValue, value: LineValue },
): boolean => fromWire(current).lt(fromWire(value));

/** The furthest medal a value reached on its line, and the next one. */
export const lineStanding = (goals: Goal[], value: LineValue) => ({
	reached: goals.filter(g => fromWire(value).gte(g.goal)).pop(),
	next: goals.find(g => fromWire(value).lt(g.goal)),
});

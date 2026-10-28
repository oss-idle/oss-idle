import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import num from '@oss-idle/shared/display/num';
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

export const lineValue = (line: string, value: number): string =>
	line === 'overdrive' ? overdriveText(value)
		: line === 'time' ? `${num(value)}h`
			: num(value);

/** The furthest medal a value reached on its line, and the next one. */
export const lineStanding = (goals: Goal[], value: number) => ({
	reached: goals.filter(g => value >= g.goal).pop(),
	next: goals.find(g => value < g.goal),
});

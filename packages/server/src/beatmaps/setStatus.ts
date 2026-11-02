import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import type { SetStatusRow } from '../db/schema/beatmapset';
import {
	enabledRulesets,
	queuedRulesets,
} from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';

type StatusFields = Partial<Omit<SetStatusRow, 'setId'>>;

/** A set's status in a ruleset; none when the ruleset never had it. */
export const statusIn = async (
	{ setStatus }: ServerRuleset,
	setId: number,
): Promise<SetStatusRow | undefined> =>
	(await db.select().from(setStatus).where(eq(setStatus.setId, setId)).limit(1))[0];

/** Write a set's status in a ruleset, creating it there when it had none. */
export const writeStatus = async (
	{ setStatus }: ServerRuleset,
	setId: number,
	fields: StatusFields,
) => {
	await db.insert(setStatus).values({
		setId, ...fields, 
	}).onDuplicateKeyUpdate({ set: fields });
};

/** A new set's status in every ruleset with a queue here, kept where it has one already. */
export const seedStatus = async (setId: number, fields: StatusFields) => {
	for (const { setStatus } of queuedRulesets()) {
		await db.insert(setStatus).ignore().values({
			setId, ...fields, 
		});
	}
};

/** The set in every ruleset that has it. */
export const statusesOf = async (setId: number) =>
	(await Promise.all(enabledRulesets().map(async r => [r, await statusIn(r, setId)] as const)))
		.filter((e): e is readonly [ServerRuleset, SetStatusRow] => e[1] !== undefined);

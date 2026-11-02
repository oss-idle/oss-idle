import { eq } from 'drizzle-orm';

import type { PendingAction } from '@oss-idle/shared/pendingAction';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { db } from '../db/client';
import {
	type CharacterRow,
	characters,
} from '../db/schema/character';
import { users } from '../db/schema/user';
import { rulesetFor } from '../rulesets/registry';
import {
	performPrestige,
	performRebirth,
	performUpgrade,
} from './actions';
import { pushCharacter } from './push';

/**
 * The actions a running play has deferred to its end.
 *
 * A play's outcome and its xp are both decided when it starts, so a purchase
 * made mid-play can never reach the play in flight. Rather than refuse it (the
 * queue means a play is nearly always running) it is parked here and run when
 * the play ends. It is a purchase, not a proposal: there is no taking it back.
 */

/**
 * Park an action behind whatever is already waiting.
 *
 * `check` runs against the locked row, so it sees every action already parked -
 * including one appended a millisecond ago by the player's other click. Checking
 * outside the lock let two requests both validate against an empty list and both
 * park, and the second was then dropped at finalise with a warning, after the
 * client had already spent it.
 */
export const queuePendingAction = async (
	characterId: number,
	action: PendingAction,
	check: (row: CharacterRow, parked: PendingAction[]) => void,
): Promise<void> => {
	await db.transaction(async tx => {
		const [row] = await tx
			.select()
			.from(characters)
			.where(eq(characters.id, characterId))
			.limit(1)
			.for('update');
		if (!row) return;
		const parked = row.pendingAction ?? [];
		check(row, parked);
		await tx
			.update(characters)
			.set({ pendingAction: [...parked, action] })
			.where(eq(characters.id, characterId));
	});
	// the other devices show it as bought too: it is one, only not yet spent
	await pushCharacter(characterId);
};

/** Read a ruleset's parked actions and clear them in one locked transaction.
 *  Reading and clearing separately loses anything parked in between - the purchase
 *  is nulled without ever being applied, and the client has already spent it. The
 *  other rulesets' wait for their own plays. */
const takePendingActions = async (
	characterId: number,
	ruleset: RulesetId,
): Promise<PendingAction[]> =>
	db.transaction(async tx => {
		const [row] = await tx
			.select({ pendingAction: characters.pendingAction })
			.from(characters)
			.where(eq(characters.id, characterId))
			.limit(1)
			.for('update');
		const all = row?.pendingAction ?? [];
		const actions = all.filter(a => a.ruleset === ruleset);
		if (actions.length) {
			const rest = all.filter(a => a.ruleset !== ruleset);
			await tx
				.update(characters)
				.set({ pendingAction: rest.length ? rest : null })
				.where(eq(characters.id, characterId));
		}
		return actions;
	});

/**
 * Run whatever the character parked, in the order it was asked for.
 *
 * Called from every way a play can end - finalised, failed, unranked mid-play,
 * or aborted - because the actions were queued against the character, not
 * against the play's outcome. Leaving them on any of those paths strands the
 * purchases.
 *
 * The list is cleared before any of it runs, and each action is re-read against
 * the character it actually lands on: one that is no longer affordable by its
 * turn is dropped rather than retried forever.
 *
 * Returns the character to carry on with - a rebirth in the list moves the
 * account onto the one it created.
 */
export const applyPendingAction = async (
	characterId: number,
	ruleset: RulesetId,
): Promise<number> => {
	const actions = await takePendingActions(characterId, ruleset);
	if (!actions.length) return characterId;

	// a rebirth moves the account onto a character it creates, and everything
	// behind it was bought for that one - not for the one being left
	let id = characterId;
	for (const action of actions) {
		// re-read: each one spends what the one before it left
		const [row] = await db
			.select()
			.from(characters)
			.where(eq(characters.id, id))
			.limit(1);
		if (!row) return id;
		try {
			id = await runAction(row, action) ?? id;
		} catch (e) {
			console.warn(`[pending] ${action.type} dropped for character ${id}`, e);
		}
	}
	return id;
};

/** Returns the character to carry on with, when the action changes it. */
const runAction = async (
	row: CharacterRow,
	action: PendingAction,
): Promise<number | undefined> => {
	const r = rulesetFor(action.ruleset);
	switch (action.type) {
		case 'upgrade':
			await performUpgrade(r, row.id, action.skill);
			return undefined;
		case 'prestige':
			await performPrestige(r, row.id, action.skill);
			return undefined;
		case 'rebirth': {
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, row.userId))
				.limit(1);
			return user ? performRebirth(r, user, row, action.name) : undefined;
		}
	}
};

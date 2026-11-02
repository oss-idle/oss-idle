import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

/**
 * One character in one ruleset: what plays, queues and is listed online. Every slot
 * of an account plays at once; a client watches one, its current character in the
 * ruleset it picked. 4K's slot is the bare character id, as everything was keyed
 * before rulesets played side by side.
 */
export type Slot = string & { readonly slot: unique symbol };

export const slotOf = (characterId: number, ruleset: RulesetId): Slot =>
	(ruleset === 'mania4k' ? String(characterId) : `${characterId}:${ruleset}`) as Slot;

export const parseSlot = (slot: Slot): { characterId: number, ruleset: RulesetId } => {
	const [id, ruleset = 'mania4k'] = slot.split(':');
	return {
		characterId: Number(id), ruleset: ruleset as RulesetId,
	};
};

export const characterOfSlot = (slot: Slot): number => parseSlot(slot).characterId;

/** The slot a character's clients watch: the ruleset it picked. */
export const watchedSlot = (character: { id: number, ruleset: RulesetId }): Slot =>
	slotOf(character.id, character.ruleset);

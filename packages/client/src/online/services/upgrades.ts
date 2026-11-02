import { effectOf } from '@oss-idle/shared/genetics';
import { applyUpgrade } from '@oss-idle/shared/upgrades';

import type Character from '../../db/schema/character';
import Entities from '../../entity/entities';
import {
	selectedDef,
	selectedProgression,
} from '../../rulesets/registry';
import { rpc } from '../client';
import { sendCharacterAction } from './characterAction';

/** Buy the live character's next upgrade: guests locally, signed-in via the
 *  server. Returns true when it landed. */
export const purchaseUpgrade = async (skillName: string): Promise<boolean> => {
	const character = Entities.character.get();
	if (character.id === 0) return false;

	// a guest's play is already resolved, so nothing it does now can reach it:
	// the purchase simply happens
	if (character.isGuest()) return spendLocally(character, skillName);

	// Parked behind a running play: the server does it when the play ends, and
	// until then the character here spends it exactly as it will there. The real
	// values land when the play ends and the character is re-read.
	return sendCharacterAction(
		'Upgrade',
		rpc.v1.me.upgrade.$post({ json: { skill: skillName } }),
		() => spendLocally(character, skillName),
	);
};

/** Run the purchase against the character in hand, with the shared math. */
const spendLocally = async (
	character: Character,
	skillName: string,
): Promise<boolean> => {
	const skill = character.skills.find(s => s.name === skillName);
	if (!skill) return false;
	let spent = 0;
	try {
		const genetics = selectedDef().genetics;
		const bonus = genetics ? effectOf(genetics, character.genetics.get(), 'overdrive', skillName) : 0;
		const purchase = applyUpgrade(skill.state(), bonus);
		skill.apply(purchase);
		spent = purchase.spent;
	} catch {
		return false;
	}
	selectedProgression()?.afterUpgrade(character, skillName);
	await character.spendXP(skillName, spent);
	return true;
};

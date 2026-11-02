import { convert } from '@oss-idle/shared/genetics';
import {
	applyPrestige,
	canRebirth,
} from '@oss-idle/shared/upgrades';

import Character from '../../db/schema/character';
import Entities from '../../entity/entities';
import {
	selectedDef,
	selectedProgression,
} from '../../rulesets/registry';
import { rpc } from '../client';
import { sendCharacterAction } from './characterAction';

/** Prestige one skill of the live character: guests locally, signed-in via the
 *  server. Returns true when it landed. */
export const prestigeSkill = async (skillName: string): Promise<boolean> => {
	const character = Entities.character.get();
	if (character.id === 0 || !selectedDef().rebirth) return false;

	// a guest's play is already resolved, so nothing it does now can reach it
	if (character.isGuest()) return prestigeLocally(character, skillName);

	// parked behind a running play: spend it here now, exactly as the server
	// will when the play ends. Without this the button looks broken - and gets
	// pressed again, parking a second prestige nobody asked for.
	return sendCharacterAction(
		'Prestige',
		rpc.v1.me.prestige.$post({ json: { skill: skillName } }),
		() => prestigeLocally(character, skillName),
	);
};

/** Run the prestige against the character in hand, with the shared math. */
const prestigeLocally = async (
	character: Character,
	skillName: string,
): Promise<boolean> => {
	const skill = character.skills.find(s => s.name === skillName);
	if (!skill) return false;
	let spent = 0;
	const overdrive = skill.overdrive.get();
	try {
		const next = applyPrestige(skill.state());
		skill.apply(next);
		spent = next.spent;
	} catch {
		return false;
	}
	// what overdrive is left becomes climaxx instead of being lost
	if (selectedDef().genetics) {
		const genetics = convert(character.genetics.get(), skillName, overdrive);
		if (character.isGuest()) await character.saveGenetics(genetics);
		else await character.genetics.set(genetics);
	}
	selectedProgression()?.afterPrestige(character, skillName);
	// and the levels it reset stop counting toward the overall level, the
	// same way the server route drops them
	await character.spendXP(skillName, spent);
	return true;
};

/** Whether the live character has reached the overall level rebirth needs. */
export const rebirthAvailable = (): boolean => {
	const character = Entities.character.get();
	return !!selectedDef().rebirth && character.id !== 0
		&& canRebirth(character.overallLifetimeLevel(), character.generation);
};

/** Start a fresh character one generation up. The previous one stays playable
 *  and keeps everything but its name. */
export const rebirth = async (name: string): Promise<boolean> => {
	const character = Entities.character.get();
	if (character.id === 0) return false;

	if (character.isGuest()) {
		if (!canRebirth(character.overallLifetimeLevel(), character.generation)) return false;
		const locals = await Character.locals();
		if (locals.some(c => c.generation > character.generation)) return false;

		character.name = `${character.name}_old`;
		await character.update();

		const fresh = await Character.newCharacter(name, character.generation + 1);
		Entities.character.set(fresh);
		return true;
	}

	// never parked: a running play carries on, on the character it started on
	return sendCharacterAction('Rebirth', rpc.v1.me.rebirth.$post({ json: { name } }), () => false);
};

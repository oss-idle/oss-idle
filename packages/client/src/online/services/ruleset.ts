import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import Character from '../../db/schema/character';
import { SETTINGS } from '../../db/settings';
import Entities from '../../entity/entities';
import { resetMods } from '../../gameplay/playMods';
import {
	loadRuleset,
	selectedRuleset,
} from '../../rulesets/registry';
import Account from '../account';
import { rpc } from '../client';
import { currentLocalPlay } from '../localPlay';

/** The ruleset a guest is held to: a reborn one stays in the ruleset it was reborn in,
 *  as a reborn account does. */
export const guestLock = (character: Character): RulesetId | undefined =>
	character.isGuest() && character.generation > 1
		? (character.rulesetLock || 'mania4k') as RulesetId
		: undefined;

/** A guest picks on this device: the local character reads its progress in the other ruleset. */
const pickLocally = async (character: Character, ruleset: RulesetId): Promise<boolean> => {
	const lock = guestLock(character);
	if (currentLocalPlay() || (lock && lock !== ruleset)) return false;
	await loadRuleset(ruleset);
	resetMods();
	void SETTINGS.rate.set(1);
	void SETTINGS.guestRuleset.set(ruleset);
	void selectedRuleset.set(ruleset);
	Entities.character.set(await Character.guest());
	return true;
};

/** Pick the ruleset the character plays: the server answers with the character in it,
 *  and the socket reconnects onto it, bringing that ruleset's own rate and mods. The one
 *  left keeps playing. Refused for a reborn character's other rulesets. */
export const pickRuleset = async (ruleset: RulesetId): Promise<boolean> => {
	const character = Entities.character.get();
	if (character.isGuest()) return pickLocally(character, ruleset);
	void loadRuleset(ruleset);
	const res = await rpc.v1.me.ruleset.$put({ json: { ruleset } });
	if (!res.ok) return false;
	Account.character.set(await res.json());
	return true;
};

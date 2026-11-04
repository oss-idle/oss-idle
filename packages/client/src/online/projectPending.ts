import {
	convert,
	effectOf,
} from '@oss-idle/shared/genetics';
import type { PendingAction } from '@oss-idle/shared/pendingAction';
import {
	applyPrestige,
	applyUpgrade,
	canPrestige,
	prestigeOverdrive,
} from '@oss-idle/shared/upgrades';

import type Character from '../db/schema/character';
import {
	selectedDef,
	selectedRuleset,
} from '../rulesets/registry';

/**
 * Show the character as it will be once the running play ends.
 *
 * Purchases made during a play are parked server-side and applied when the play
 * ends, so the row the server hands back until then is genuinely unspent. Left
 * alone, reloading mid-play shows the levels back and offers the same purchase
 * again - the server refuses it, but only after the click.
 *
 * The parked actions come down with the character, so they are run through it
 * here, with the same shared math the server will use, climaxx included. Nothing
 * is written: this is the display catching up with a decision already made.
 */
export const projectPending = (
	character: Character,
	actions: PendingAction[] | undefined,
): void => {
	for (const action of actions ?? []) {
		// the shown skills are the picked ruleset's; another's wait for its own play
		if (action.type === 'rebirth' || action.ruleset !== selectedRuleset.get()) continue;
		const skill = character.skills.find(s => s.name === action.skill);
		if (!skill) continue;
		const genetics = selectedDef().genetics;
		const held = character.genetics.get();
		const bonus = genetics ? effectOf(genetics, held, 'overdrive', action.skill) : 0;
		const state = skill.state();
		try {
			if (action.type === 'upgrade') {
				skill.apply(applyUpgrade(state, bonus));
				continue;
			}
			skill.apply(applyPrestige(state, action.force));
			if (genetics && canPrestige(state)) {
				void character.genetics.set(convert(held, action.skill, prestigeOverdrive(state, bonus)));
			}
		} catch {
			// one the character cannot afford will be dropped server-side too
		}
	}
};

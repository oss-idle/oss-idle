import {
	changeableAt,
	geneticSlots,
	pickedSkills,
} from '@oss-idle/shared/genetics';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import type Character from '../../db/schema/character';
import { geneticChoiceSlot } from '../../globals';
import { PBE } from '../../pbe/pbe';

/** Which of the character's genetics this choice is for. With several and none free, one of them
 *  is clicked on the ring first: that one is replaced. */
export default function useChoiceSlot(character: Character) {
	const [genetics] = useSynced(character.genetics);
	const [chosen] = useSynced(geneticChoiceSlot);
	const count = genetics.picks.length, slots = geneticSlots(character.generation);
	const slot = chosen ?? (slots === 1 && count === 1 ? 0 : undefined);
	const changing = slot !== undefined && slot < count;
	const needsSlot = count >= slots && slot === undefined;
	const picked = pickedSkills(genetics);
	return {
		slot,
		changing,
		needsSlot,
		several: slots > 1,
		picks: genetics.picks,
		another: !changing && !needsSlot && count > 0,
		more: !changing && count + 1 < slots,
		others: picked.filter((_, i) => i !== slot),
		leaving: changing ? picked[slot] : undefined,
		/** a click on the ring: one of the genetics frees it (or takes it back), any other is picked */
		click: (skill: string, pick: (skill: string | undefined) => void) => {
			const at = picked.indexOf(skill);
			if (at < 0) {
				if (!needsSlot) pick(skill);
			} else if (at === slot) {
				if (slots > 1) {
					void geneticChoiceSlot.set(undefined);
					pick(undefined);
				}
			} else if (PBE || Date.now() >= changeableAt(genetics.picks[at])) {
				void geneticChoiceSlot.set(at);
				pick(undefined);
			}
		},
	};
}

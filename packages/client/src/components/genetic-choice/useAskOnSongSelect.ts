import { useEffect } from 'react';

import {
	type GeneticsDef,
	geneticSlots,
} from '@oss-idle/shared/genetics';

import type Character from '../../db/schema/character';
import { geneticChoice } from '../../globals';

/** A character with a genetic left to pick is asked for it as soon as it reaches song select. */
export default function useAskOnSongSelect(
	inSelect: boolean,
	character: Character,
	def?: GeneticsDef,
) {
	useEffect(() => {
		if (!inSelect || character.id === 0 || !def) return;
		if (character.genetics.get().picks.length >= geneticSlots(character.generation)) return;
		if (!geneticChoice.get()) void geneticChoice.set('change');
	}, [inSelect, character, def]);
}

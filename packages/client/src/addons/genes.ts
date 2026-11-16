import { toText } from '@oss-idle/shared/big';
import {
	climaxxOf,
	type Genetics,
	type GeneticsDef,
	learnRefusal,
	nextTierPrice,
	pickedSkills,
	type PlayLevels,
	strength,
	tierOf,
} from '@oss-idle/shared/genetics';

import type { GameState } from './state';

/** The genes the character can learn or upgrade now, with the climaxx it has.
 *  `text`: a gene's name, and what it does at a tier and its tree's strength.
 *  `local`: a local character, which only uses the XP and overdrive genes. */
export const learnableGenes = (
	def: GeneticsDef,
	genetics: Genetics,
	levels: PlayLevels,
	text: { name: (gene: string) => string, does: (gene: string, n: number) => string },
	local: boolean,
): NonNullable<GameState['genes']> =>
	def.genes
		.filter(gene => !learnRefusal(def, genetics, gene.id, levels)
			&& (!local || gene.effect === 'xp' || gene.effect === 'overdrive'))
		.map((gene) => {
			const tier = tierOf(genetics, gene.id) + 1;
			return {
				id: gene.id,
				name: text.name(gene.id),
				skill: gene.skill,
				tier,
				price: nextTierPrice(def, genetics, gene.skill),
				does: text.does(gene.id, tier * strength(def, pickedSkills(genetics), gene.skill)),
			};
		});

/** The character's genetics, whole: what it was born for, each skill's climaxx, and every
 *  gene with the tier it holds. `text` as for {@link learnableGenes}. */
export const geneticsState = (
	def: GeneticsDef,
	genetics: Genetics,
	levels: PlayLevels,
	text: { name: (gene: string) => string, does: (gene: string, n: number) => string },
): NonNullable<GameState['genetics']> => {
	const picks = pickedSkills(genetics);
	return {
		picks,
		skills: def.ring.map(skill => ({
			skill, climaxx: toText(climaxxOf(def, genetics, skill, levels[skill] ?? 0)),
		})),
		genes: def.genes.map((gene) => {
			const tier = tierOf(genetics, gene.id);
			return {
				id: gene.id,
				name: text.name(gene.id),
				skill: gene.skill,
				...gene.parent ? { parent: gene.parent } : {},
				tier,
				max: gene.max,
				does: text.does(gene.id, Math.max(tier, 1) * strength(def, picks, gene.skill)),
			};
		}),
	};
};

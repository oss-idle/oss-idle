import type {
	Genetics,
	GeneticsDef,
	PlayLevels,
} from '@oss-idle/shared/genetics';

import GeneCard from './GeneCard';
import type { Point } from './geneLayout';
import {
	CARD_GAP,
	SKY_CENTER,
	SKY_H,
	SKY_W,
} from './GeneticsSky';
import SkillCard from './SkillCard';

const CARD_W = 330, CARD_H = 320;
/** what `selected` holds when the skill's own star is open */
export const STAR = '@star';

/** Where a card goes: beside what it is about, on the side away from the star, kept on the sky. */
const cardAt = ([x, y]: Point) => ({
	left: `${(x < SKY_CENTER[0] ? x - CARD_GAP - CARD_W : x + CARD_GAP) / SKY_W * 100}%`,
	top: `${Math.max(x < SKY_CENTER[0] ? 4 : 80, Math.min(y - 110, SKY_H - CARD_H)) / SKY_H * 100}%`,
});

/** What a character can do from the cards; the preview's cards only tell. */
export type GeneActions = {
	levels: PlayLevels,
	climaxx: number,
	overdrive: number,
	/** overdrive the next tier needs; none when there is nothing to convert */
	need?: number,
	local: boolean,
	busy: boolean,
	onLearn: (gene: string) => void,
	onSell: (gene: string) => void,
	onConvert: () => void,
};

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	skill: string,
	/** a gene, or {@link STAR} */
	selected?: string,
	at?: Point,
	actions?: GeneActions,
};

/** The open card: a gene's beside it, or the skill's own beside its star. */
export default function GeneticsCards({
	def, genetics, skill, selected, at, actions,
}: Props) {
	if (selected === STAR) {
		return (
			<div className="genetics__card" style={cardAt([SKY_CENTER[0] + 10, SKY_CENTER[1]])}>
				<SkillCard def={def} genetics={genetics} skill={skill} actions={actions} />
			</div>
		);
	}
	if (!selected || !at) return null;
	return (
		<div className="genetics__card" style={cardAt(at)}>
			<GeneCard def={def} genetics={genetics} gene={selected} actions={actions} />
		</div>
	);
}

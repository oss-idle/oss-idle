import {
	type Genetics,
	type GeneticsDef,
	pickedSkills,
	strength,
	tierOf,
} from '@oss-idle/shared/genetics';

import { placeLabels } from './geneLabels';
import {
	type Burst,
	burst,
	type Point,
} from './geneLayout';
import GeneNode from './GeneNode';
import { geneName } from './geneText';

/** Keeps a name off its tree's star. */
const STAR_ROOM = 34;

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	skill: string,
	layout: Burst,
	r: number,
	selected?: string,
	/** neighbours at the edges only name what they hold */
	quiet?: boolean,
	onPick?: (gene: string) => void,
	/** where each gene was drawn, for the card and the arrow keys */
	placed?: (at: Record<string, Point>) => void,
};

/** One skill's genes around its star: a line from the star to each root, then parent to child. */
export default function GeneTree({
	def, genetics, skill, layout, r, selected, quiet, onPick, placed,
}: Props) {
	const tree = def.genes.filter(g => g.skill === skill);
	const at = burst(tree, layout);
	placed?.(at);
	const half = strength(def, pickedSkills(genetics), skill) === 0.5;
	const held = (id?: string) => !!id && tierOf(genetics, id) > 0;
	const [cx, cy] = layout.center;
	const labels = placeLabels(
		tree.map(gene => ({
			id: gene.id, at: at[gene.id], name: geneName(gene.id), tiered: gene.max > 1, 
		})),
		r,
		r >= 14 ? 13 : 11,
		quiet ? undefined : layout.center,
		STAR_ROOM,
	);

	return (
		<g className="gene-tree">
			{tree.map(gene => {
				const [x, y] = at[gene.id];
				const [px, py] = gene.parent ? at[gene.parent] : [cx, cy];
				const lit = held(gene.id) && (!gene.parent || held(gene.parent));
				return (
					<line
						key={`line-${gene.id}`}
						x1={px}
						y1={py}
						x2={x}
						y2={y}
						stroke={lit ? 'rgba(255, 165, 200, 0.85)' : 'rgba(255, 165, 200, 0.28)'}
						strokeWidth={lit ? 2.5 : 1.5}
					/>
				);
			})}
			{tree.map((gene, index) => (
				<GeneNode
					key={gene.id}
					at={at[gene.id]}
					r={r}
					name={geneName(gene.id)}
					tier={tierOf(genetics, gene.id)}
					max={gene.max}
					open={!gene.parent || held(gene.parent)}
					half={half}
					selected={gene.id === selected}
					index={index}
					label={labels[gene.id]}
					quiet={quiet}
					onPick={onPick && (() => onPick(gene.id))}
				/>
			))}
		</g>
	);
}

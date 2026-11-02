import type { ReactNode } from 'react';

import {
	type GeneticsDef,
	strength,
} from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import { selectedDef } from '../../rulesets/registry';

const SIZE = 640, C = SIZE / 2, R0 = 165, R1 = 285;

const polar = (r: number, deg: number) => {
	const a = (deg - 90) * Math.PI / 180;
	return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

const wedge = (from: number, to: number) => {
	const [x0, y0] = polar(R0, from), [x1, y1] = polar(R1, from);
	const [x2, y2] = polar(R1, to), [x3, y3] = polar(R0, to);
	return `M${x0} ${y0}L${x1} ${y1}A${R1} ${R1} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R0} ${R0} 0 0 0 ${x0} ${y0}Z`;
};

/** A skill's mark on the ring: its strength, beyond the plain genetic and neighbour. */
const tagOf = (mine: boolean, power: number) => {
	if (mine) return power === 1 ? '★' : `★ ${power * 100}%`;
	if (power === 0.5) return '½';
	return power ? `${power * 100}%` : '✦';
};

type Props = {
	def: GeneticsDef,
	picked?: string,
	/** the character's other genetics: lit, and can't be picked again */
	others?: readonly string[],
	/** the genetic being replaced */
	leaving?: string,
	hovered?: string,
	/** what the quiz suggests */
	suggested?: readonly string[],
	onHover: (skill: string | undefined) => void,
	onPick: (skill: string) => void,
	/** what sits in the middle */
	hub: ReactNode,
};

/** Every skill around one ring: the pick and its neighbours stay lit, hovering only lifts. */
export default function GeneticRing({
	def, picked, others = [], leaving, hovered, suggested = [], onHover, onPick, hub,
}: Props) {
	const n = def.ring.length, w = 360 / n;
	const all = picked ? [...others, picked] : [...others];
	return (
		<svg
			className="genetic-ring"
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			onMouseLeave={() => onHover(undefined)}
		>
			{def.ring.map((skill, i) => {
				const [lx, ly] = polar((R0 + R1) / 2, i * w);
				const [dx, dy] = polar(1, i * w);
				const mine = all.includes(skill), power = strength(def, all, skill);
				const state = [
					mine && 'is-picked',
					skill === leaving && 'is-leaving',
					!mine && power > 0 && 'is-near',
					skill === hovered && 'is-hovered',
					suggested.includes(skill) && 'is-suggested',
				].filter(Boolean).join(' ');
				return (
					<g
						key={skill}
						className={`genetic-ring__skill ${state}`}
						style={{
							'--dx': `${dx - C}px`, '--dy': `${dy - C}px`, '--i': i, 
						} as React.CSSProperties}
						onMouseEnter={() => {
							uiSound('ui/default-hover');
							onHover(skill);
						}}
						onClick={() => {
							uiSound('ui/default-select');
							onPick(skill);
						}}
					>
						<path className="genetic-ring__wedge" d={wedge(i * w - w / 2, i * w + w / 2)} />
						<text x={lx} y={ly + 5} textAnchor="middle">{selectedDef().skillName(skill)}</text>
						{(power > 0 || suggested.includes(skill) || skill === leaving) && (
							<text className="genetic-ring__tag" x={lx} y={ly + 24} textAnchor="middle">
								{skill === leaving ? '↺' : tagOf(mine, power)}
							</text>
						)}
					</g>
				);
			})}
			<foreignObject x={C - 140} y={C - 110} width={280} height={220}>
				<div className="genetic-ring__hub">{hub}</div>
			</foreignObject>
		</svg>
	);
}

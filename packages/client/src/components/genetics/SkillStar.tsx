type Props = {
	at: readonly [number, number],
	r: number,
	name: string,
	/** the tree's strength: 0.5 a neighbour, 0 out of reach, 1 or more a full tree */
	strength: number,
	onPick?: () => void,
};

/** A skill's own star, its genes all around it. */
export default function SkillStar({
	at: [x, y], r, name, strength, onPick,
}: Props) {
	let fill = 'rgba(40, 30, 44, 0.9)', ink = 'rgba(255, 255, 255, 0.5)';
	if (strength >= 1) [fill, ink] = ['#ff66ab', '#1a1018'];
	else if (strength) [fill, ink] = ['rgba(255, 138, 183, 0.55)', '#fff'];
	return (
		<g className={onPick ? 'skill-star gene--pickable' : 'skill-star'} onClick={onPick}>
			<circle
				cx={x}
				cy={y}
				r={r}
				fill={fill}
				stroke={strength ? '#ffd0e2' : 'rgba(255, 255, 255, 0.2)'}
				strokeWidth={2}
			/>
			<text x={x} y={y + 5} textAnchor="middle" fontSize={r >= 26 ? 14 : 12} fontWeight={600} fill={ink}>
				{name}
			</text>
		</g>
	);
}

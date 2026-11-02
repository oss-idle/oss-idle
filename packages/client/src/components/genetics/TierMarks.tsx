type Props = { x: number, y: number, r: number, tier: number, max: number };

/** A gene's tiers under it, the held ones lit. */
export default function TierMarks({
	x, y, r, tier, max,
}: Props) {
	const big = r >= 12;
	const pip = big ? 5 : 3, gap = big ? 3 : 2, width = max * pip + (max - 1) * gap;
	return (
		<>
			{Array.from({ length: max }, (_, i) => (
				<rect
					key={i}
					x={x - width / 2 + i * (pip + gap)}
					y={y + r + 5}
					width={pip}
					height={big ? 3 : 2}
					fill={i < tier ? '#ff66ab' : 'rgba(255, 255, 255, 0.18)'}
				/>
			))}
		</>
	);
}

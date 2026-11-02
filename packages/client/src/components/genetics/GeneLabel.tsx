import type { Label } from './geneStyle';

type Props = { at: Label, name: string, big: boolean, strong: boolean, dim: boolean };

/** A gene's name on the sky. */
export default function GeneLabel({
	at, name, big, strong, dim,
}: Props) {
	return (
		<text
			x={at.x}
			y={at.y}
			textAnchor={at.anchor}
			fontSize={big ? 13 : 11}
			fontWeight={strong ? 500 : 300}
			opacity={dim ? 0.5 : 1}
		>
			{name}
		</text>
	);
}

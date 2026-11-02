import { Trans } from '@lingui/react/macro';

type Props = { changing: boolean, several: boolean };

/** The lines under the ring's buttons: what changing costs, and how genetics add up. */
export default function GeneticChoiceUnder({ changing, several }: Props) {
	return (
		<>
			<div>
				{changing
					? <Trans>Genes of the trees you lose come back as climaxx in full. You can change again in a week.</Trans>
					: <Trans>You can change it later.</Trans>}
			</div>
			{several && (
				<div><Trans>Strengths add up: 100% for a genetic, 50% from each genetic beside it.</Trans></div>
			)}
		</>
	);
}

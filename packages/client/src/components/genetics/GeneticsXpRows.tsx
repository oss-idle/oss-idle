import {
	Plural,
	Trans,
} from '@lingui/react/macro';

import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import {
	type GeneticsXpParts,
	geneticsXpTotal,
} from '@oss-idle/shared/genetics';

const percent = (share: number) => `+${Math.round(share * 1000) / 10}%`;

/** What a skill's XP bonus from its genetics is made of. */
export default function GeneticsXpRows({ parts }: { parts: GeneticsXpParts }) {
	const { genetic, genes, tiers, fromTiers, lnMaps } = parts;
	return <>
		{genetic > 0 && (
			<HoverCardRow label={<Trans>Your genetics</Trans>}>{percent(genetic)}</HoverCardRow>
		)}
		{genes > 0 && <HoverCardRow label={<Trans>XP genes</Trans>}>{percent(genes)}</HoverCardRow>}
		{tiers > 0 && (
			<HoverCardRow label={<Plural value={tiers} one="# tier bought" other="# tiers bought" />}>
				{percent(fromTiers)}
			</HoverCardRow>
		)}
		<HoverCardRow label={<Trans>Total XP bonus</Trans>}>
			{percent(geneticsXpTotal(parts) - 1)}
		</HoverCardRow>
		{lnMaps > 0 && (
			<HoverCardRow label={<Trans>More on LN maps</Trans>}>{percent(lnMaps)}</HoverCardRow>
		)}
	</>;
}

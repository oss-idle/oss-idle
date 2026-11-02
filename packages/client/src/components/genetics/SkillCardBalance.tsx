import { Trans } from '@lingui/react/macro';

import {
	CLIMAXX_SYMBOL,
	conversionGain,
	type Genetics,
	type GeneticsDef,
	geneticsXpMultiplier,
	geneticsXpParts,
	MILESTONES,
} from '@oss-idle/shared/genetics';
import { OVERDRIVE_SYMBOL } from '@oss-idle/shared/upgrades';

import { uiSound } from '../../audio/uiSounds';
import type { GeneActions } from './GeneticsCards';
import GeneticsXpRows from './GeneticsXpRows';

type Props = {
	def: GeneticsDef,
	genetics: Genetics,
	skill: string,
	actions: GeneActions,
};

/** What a character holds in a skill: its climaxx, its next free tier, and turning overdrive into climaxx. */
export default function SkillCardBalance({
	def, genetics, skill, actions: { levels, climaxx, overdrive, busy, onConvert },
}: Props) {
	const next = MILESTONES.find(level => level > (levels[skill] ?? 0));
	const amount = climaxx.toLocaleString(), od = overdrive.toFixed(1);
	const gain = conversionGain(genetics.converted[skill] ?? 0, overdrive);
	const boosted = geneticsXpMultiplier(def, genetics, skill) > 1;
	return (
		<>
			<div className="gene-card__next">
				<Trans><b>{CLIMAXX_SYMBOL}{amount}</b> climaxx</Trans>
			</div>
			{boosted && (
				<div className="gene-card__next gene-card__xp">
					<GeneticsXpRows parts={geneticsXpParts(def, genetics, skill)} />
				</div>
			)}
			{next !== undefined && (
				<div className="gene-card__next"><Trans>Next free upgrade at level {next}</Trans></div>
			)}
			{overdrive > 0 && gain > 0 && (
				<div className="gene-card__acts">
					<button
						className="gene-card__sell"
						disabled={busy}
						onMouseEnter={() => uiSound('ui/default-hover')}
						onClick={onConvert}
					>
						<span>
							<Trans>Turn {OVERDRIVE_SYMBOL}{od} overdrive into {CLIMAXX_SYMBOL}{gain}</Trans>
						</span>
					</button>
				</div>
			)}
		</>
	);
}

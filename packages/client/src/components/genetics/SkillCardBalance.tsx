import { Trans } from '@lingui/react/macro';

import BigNum from '@oss-idle/shared/display/BigNum';
import {
	CLIMAXX_SYMBOL,
	conversionGain,
	type Genetics,
	type GeneticsDef,
	geneticsXpMultiplier,
	geneticsXpParts,
	MILESTONES,
} from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import ConvertText from './ConvertText';
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
	def, genetics, skill, actions: { levels, climaxx, overdrive, need, busy, onConvert },
}: Props) {
	const next = MILESTONES.find(level => level > (levels[skill] ?? 0));
	const amount = <BigNum value={climaxx} theme="royal" />;
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
			{need !== undefined && (
				<div className="gene-card__acts">
					<button
						className="gene-card__sell"
						disabled={busy || overdrive < need}
						onMouseEnter={() => uiSound('ui/default-hover')}
						onClick={onConvert}
					>
						<span>
							<ConvertText
								need={need}
								overdrive={overdrive}
								gain={conversionGain(genetics.converted[skill] ?? 0, need)}
							/>
						</span>
					</button>
				</div>
			)}
		</>
	);
}

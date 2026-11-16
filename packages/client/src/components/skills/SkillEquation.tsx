import {
	Plural,
	Trans,
} from '@lingui/react/macro';

import HoverCard from '@oss-idle/shared/display/HoverCard';
import { formatMultiplier } from '@oss-idle/shared/display/num';
import OverdriveNum from '@oss-idle/shared/display/OverdriveNum';
import PrestigeDiamonds from '@oss-idle/shared/display/PrestigeDiamonds';

import GeneticsXpRows from '../genetics/GeneticsXpRows';
import SkillChip from './SkillChip';
import type { SkillStats } from './skillStats';

/** The XP multiplier written out: upgrades x overdrive → boost, x prestige x genetics x medals = total.
 *  A part that changes nothing is dimmed. */
export default function SkillEquation({ s }: { s: SkillStats }) {
	const { upgrades, max, medals } = s;
	const od = <OverdriveNum value={s.overdrive} />;
	const held = medals?.held ?? 0;

	return (
		<div className="skill-eq">
			<SkillChip
				label={<Trans>{upgrades}/{max} upgrades</Trans>}
				value={`+${s.upgradePercent}%`}
				base={upgrades === 0}
			/>
			<span className="skill-eq__op">x</span>
			<SkillChip
				label={<Trans>overdrive {od}</Trans>}
				value={formatMultiplier(s.overdriveBoost)}
				base={s.overdriveBoost.eq(1)}
				kind="is-pink"
			/>
			<span className="skill-eq__op">→</span>
			<SkillChip
				label={<Trans>upgrade boost</Trans>}
				value={formatMultiplier(s.upgradeBoost)}
				base={s.upgradeBoost.eq(1)}
			/>
			<span className="skill-eq__op">x</span>
			<SkillChip
				label={<PrestigeDiamonds prestige={s.prestige} />}
				value={formatMultiplier(s.prestigeBoost)}
				base={s.prestige === 0}
			/>
			{s.genetics !== undefined && <>
				<span className="skill-eq__op">x</span>
				<HoverCard card={s.geneticsParts && <GeneticsXpRows parts={s.geneticsParts} />}>
					<SkillChip
						label={<Trans>genetics</Trans>}
						value={formatMultiplier(s.genetics)}
						base={s.genetics === 1}
					/>
				</HoverCard>
			</>}
			{medals && <>
				<span className="skill-eq__op">x</span>
				<SkillChip
					label={<Plural value={held} one="# medal" other="# medals" />}
					value={formatMultiplier(medals.multiplier)}
					base={medals.multiplier === 1}
				/>
			</>}
			<span className="skill-eq__op">=</span>
			<SkillChip label={<Trans>XP</Trans>} value={formatMultiplier(s.total)} kind="is-total" />
		</div>
	);
}

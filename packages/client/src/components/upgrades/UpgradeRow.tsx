import { Trans } from '@lingui/react/macro';

import OverdriveNum from '@oss-idle/shared/display/OverdriveNum';
import SkillLevel from '@oss-idle/shared/display/SkillLevel';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import { selectedDef } from '../../rulesets/registry';
import ConfirmMenu from '../ConfirmMenu';
import UpgradeAction from './UpgradeAction';
import UpgradeTooltip from './UpgradeTooltip';
import UpgradeTrack from './UpgradeTrack';
import { useUpgrade } from './useUpgrade';

export default function UpgradeRow({
	skill,
	locked,
	overdriveBonus,
	lifetimeXp,
}: {
	skill: SkillState,
	locked: boolean,
	/** what the genes add to each overdrive gain */
	overdriveBonus?: number,
	/** xp ever earned on the skill, shown as a level behind it on hover */
	lifetimeXp?: number,
}) {
	const u = useUpgrade(skill, locked, overdriveBonus);
	const from = u.minLevel - u.cost;
	const at = u.level + u.xp / SkillState.xpForLevel(u.level);
	const progress = Math.min(1, Math.max(0, (at - from) / u.cost));
	const factor = u.multiplier.toFixed(2);
	const state = u.maxed ? 'is-maxed' : u.preview ? 'is-ready' : '';

	return (
		<div className={`ladder-row ${state}`}>
			<div className="ladder-row__skill">
				<span className="ladder-row__name">{selectedDef().skillName(skill.name)}</span>
				<span className="ladder-row__lv">
					<Trans>XP Lv<SkillLevel
						level={u.level} xp={u.xp} prestige={u.prestige} lifetimeXp={lifetimeXp} xpLevel
					/></Trans>
				</span>
				<span className={`ladder-row__mult ${u.multiplier > 1 ? '' : 'is-base'}`}>
					<Trans>x{factor} XP</Trans>
				</span>
				{u.overdrive > 0 && <span className="ladder-row__od"><OverdriveNum value={u.overdrive} /></span>}
			</div>
			<div className="ladder-row__ladder" title={selectedDef().upgradeDescription(skill.name)}>
				<div className="ladder-row__gear">
					<span className="ladder-row__now">{selectedDef().upgradeLabel(skill.name, u.upgrades)}</span>
					{!u.maxed && (
						<span className="ladder-row__next">
							<span className="ladder-row__arrow">›</span>
							{selectedDef().upgradeLabel(skill.name, u.upgrades + 1)}
						</span>
					)}
					<span className="ladder-row__count">{u.upgrades}/{u.max}</span>
				</div>
				<UpgradeTrack
					upgrades={u.upgrades}
					max={u.max}
					maxed={u.maxed}
					ready={!!u.preview}
					progress={progress}
				/>
			</div>
			<UpgradeAction
				progress={progress}
				maxed={u.maxed}
				overdrive={u.overdrive}
				preview={u.preview}
				busy={u.busy}
				minLevel={u.minLevel}
				onBuy={() => void u.buy()}
				onConfirm={u.confirm}
				tip={<UpgradeTooltip
					skill={skill.name}
					level={u.level}
					xp={u.xp}
					upgrades={u.upgrades}
					overdrive={u.overdrive}
					minLevel={u.minLevel}
					preview={u.preview}
				/>}
			/>
			{u.confirming && <ConfirmMenu {...u.confirming} onClose={u.closeConfirm} />}
		</div>
	);
}

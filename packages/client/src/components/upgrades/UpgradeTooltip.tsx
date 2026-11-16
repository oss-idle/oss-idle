import {
	Plural,
	Trans,
} from '@lingui/react/macro';

import type { Big } from '@oss-idle/shared/big';
import BigNum from '@oss-idle/shared/display/BigNum';
import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import { levelFromXp } from '@oss-idle/shared/display/levelDisplay';
import { formatMultiplier } from '@oss-idle/shared/display/num';
import OverdriveNum from '@oss-idle/shared/display/OverdriveNum';
import {
	type UpgradePurchase,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';

import SkillPerk from './SkillPerk';

const Arrow = () => <span className="ladder-tip__arrow"> → </span>;

/** What the buy button would do, before it is clicked; how far off it is when
 *  it cannot be bought yet. Levels here are XP levels, the ones upgrades spend. */
export default function UpgradeTooltip({
	skill,
	level,
	xp,
	upgrades,
	prestige,
	overdrive,
	minLevel,
	preview,
}: {
	skill: string,
	level: number,
	xp: Big,
	upgrades: number,
	prestige: number,
	overdrive: Big,
	minLevel: number,
	preview: UpgradePurchase | undefined,
}) {
	const boost = formatMultiplier(upgradeXPMultiplier(upgrades, overdrive));

	if (!preview) {
		const toGo = minLevel - level;
		const nextBoost = formatMultiplier(upgradeXPMultiplier(upgrades + 1, overdrive));
		return <>
			<HoverCardRow label={<Trans>XP level</Trans>}>{levelFromXp(level, xp)} / {minLevel}</HoverCardRow>
			<HoverCardRow label={<Trans>To go</Trans>}>
				<Plural value={toGo} one="# level" other="# levels" />
			</HoverCardRow>
			<HoverCardRow label={<Trans>XP boost</Trans>}>
				{boost}<Arrow /><span className="ladder-tip__boost">{nextBoost}</span>
			</HoverCardRow>
			<SkillPerk skill={skill} upgrades={upgrades} next={upgrades + 1} prestige={prestige} />
		</>;
	}

	const nextBoost = formatMultiplier(upgradeXPMultiplier(preview.upgrades, preview.overdrive));
	return <>
		<HoverCardRow label={<Trans>XP level</Trans>}>
			{levelFromXp(level, xp)}<Arrow />{levelFromXp(preview.level, preview.xp)}
		</HoverCardRow>
		<HoverCardRow label={<Trans>XP spent</Trans>}>
			<BigNum value={preview.spent.round()} theme="heat" />
		</HoverCardRow>
		<HoverCardRow label={<Trans>Overdrive</Trans>}>
			<OverdriveNum value={overdrive} /><Arrow /><OverdriveNum value={preview.overdrive} />
		</HoverCardRow>
		<HoverCardRow label={<Trans>XP boost</Trans>}>
			{boost}<Arrow /><span className="ladder-tip__boost">{nextBoost}</span>
		</HoverCardRow>
		<SkillPerk skill={skill} upgrades={upgrades} next={preview.upgrades} prestige={prestige} />
	</>;
}

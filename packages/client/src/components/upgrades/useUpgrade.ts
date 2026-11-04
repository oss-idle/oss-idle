import { ph } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import { bignum } from '@oss-idle/shared/display/num';
import { overdriveText } from '@oss-idle/shared/display/overdrive';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import SkillState from '@oss-idle/shared/rulesets/skillState';
import {
	applyUpgrade,
	canUpgrade,
	maxUpgrades,
	upgradeCost,
	upgradeMinLevel,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';

import { purchaseUpgrade } from '../../online/services/upgrades';
import { selectedDef } from '../../rulesets/registry';
import type { Confirm } from '../ConfirmMenu';

/** Everything an upgrade row shows and does. */
export const useUpgrade = (skill: SkillState, locked: boolean, overdriveBonus = 0) => {
	const { t } = useLingui();
	const [level] = useSynced(skill.level);
	const [xp] = useSynced(skill.xp);
	const [upgrades] = useSynced(skill.upgrades);
	const [overdrive] = useSynced(skill.overdrive);
	const [prestige] = useSynced(skill.prestige);
	const [busy, setBusy] = useState(false);
	// state lags a render: a double click would read busy as false twice and buy twice
	const inFlight = useRef(false);
	const [confirming, setConfirming] = useState<Confirm | undefined>(undefined);

	const state = {
		level, xp, upgrades, overdrive, prestige, 
	};
	const max = maxUpgrades(prestige);
	const maxed = upgrades >= max;
	const minLevel = upgradeMinLevel(upgrades);
	const preview = !locked && canUpgrade(state) ? applyUpgrade(state, overdriveBonus) : undefined;
	const multiplier = upgradeXPMultiplier(upgrades, overdrive);

	const buy = async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		try {
			await purchaseUpgrade(skill.name);
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	};

	const confirm = () => {
		if (!preview || busy) return;
		const name = selectedDef().skillName(skill.name);
		const nextGear = selectedDef().upgradeLabel(skill.name, upgrades + 1);
		const spent = bignum(Math.round(preview.spent));
		const odText = overdriveText(overdrive);
		const boost = upgradeXPMultiplier(preview.upgrades, preview.overdrive).toFixed(2);
		const odSegment = preview.overdrive !== overdrive
			? t` · Overdrive ${odText} → ${ph({ nextOd: overdriveText(preview.overdrive) })}`
			: overdrive > 0 ? t` · Overdrive ${odText}` : '';
		setConfirming({
			title: t`Buy ${nextGear}?`,
			sub: t`${name} XP Lv${level} → XP Lv${ph({ nextLevel: preview.level })} · Costs ${spent}xp${odSegment} · XP boost x${boost}`,
			confirmLabel: t`Buy`,
			color: '#ff4089',
			onConfirm: () => void buy(),
		});
	};

	return {
		...state,
		max,
		maxed,
		minLevel,
		cost: upgradeCost(upgrades),
		/** what buying now would leave; undefined when it can't be bought */
		preview,
		multiplier,
		busy,
		buy,
		confirm,
		confirming,
		closeConfirm: () => setConfirming(undefined),
	};
};

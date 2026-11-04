import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useState } from 'react';

import BigNum from '@oss-idle/shared/display/BigNum';
import HoverCard from '@oss-idle/shared/display/HoverCard';
import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import SkillLevel from '@oss-idle/shared/display/SkillLevel';
import {
	CLIMAXX_SYMBOL,
	conversionGain,
} from '@oss-idle/shared/genetics';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import SkillState from '@oss-idle/shared/rulesets/skillState';
import {
	canPrestige,
	maxUpgrades,
	prestigeMinLevel,
	prestigeOverdrive,
	prestigeXPMultiplier,
	UPGRADES_PER_PRESTIGE,
} from '@oss-idle/shared/upgrades';
import { levelProgress } from '@oss-idle/shared/xp';
import { xpToLevel } from '@oss-idle/shared/xp';

import Controls from '../../input/Controls';
import { selectedDef } from '../../rulesets/registry';
import ConfirmMenu, { type Confirm } from '../ConfirmMenu';
import PrestigeAction from './PrestigeAction';
import PrestigeClimaxxPop from './PrestigeClimaxxPop';
import PrestigeDiamonds from './PrestigeDiamonds';
import usePrestige from './usePrestige';

export default function PrestigeRow({
	skill,
	locked,
	converted,
	overdriveBonus,
	climaxxNow,
	lifetimeXp,
}: {
	skill: SkillState,
	locked: boolean,
	/** the skill's overdrive already turned into climaxx; none without genetics */
	converted?: number,
	/** the genes' raise on overdrive an upgrade adds */
	overdriveBonus?: number,
	/** the skill's climaxx, read when the prestige starts */
	climaxxNow?: () => number,
	/** xp ever earned on the skill, shown as a level behind it on hover */
	lifetimeXp?: number,
}) {
	const { t } = useLingui();
	const [level] = useSynced(skill.level);
	const [xp] = useSynced(skill.xp);
	const [prestige] = useSynced(skill.prestige);
	const [upgrades] = useSynced(skill.upgrades);
	const [held] = useSynced(skill.overdrive);
	const [shift] = useSynced(Controls.mode_Shift);
	const [confirming, setConfirming] = useState<Confirm | undefined>(undefined);

	const required = prestigeMinLevel(prestige);
	const ready = !locked && canPrestige({
		level, prestige,
	});
	// a way out of a bad build: the reset without the prestige
	const forcing = !locked && !ready && shift;
	const multiplier = prestigeXPMultiplier(prestige);
	const factor = multiplier.toFixed(2);
	const next = prestigeXPMultiplier(prestige + 1);
	const at = level + levelProgress(level, xp);
	const earned = xpToLevel(level) + xp;
	const needed = xpToLevel(required);
	const progress = Math.min(1, earned / needed);
	const overdrive = prestigeOverdrive({
		level, xp, upgrades, overdrive: held, prestige,
	}, overdriveBonus);
	const gain = converted === undefined ? 0 : conversionGain(converted, overdrive);
	const {
		busy, run, transfer, closeTransfer,
	} = usePrestige(skill.name, overdrive, gain, climaxxNow);

	const confirm = () => {
		if (busy) return;
		const name = selectedDef().skillName(skill.name);
		const note = selectedDef().prestigeNote(skill.name);
		if (forcing) {
			setConfirming({
				title: t`Force prestige ${name}?`,
				sub: [
					t`XP Lv${level} → XP Lv0 · Loses every upgrade and all Overdrive · No prestige and no Climaxx`,
					...note ? [note] : [],
				].join(' · '),
				confirmLabel: t`Force prestige`,
				color: '#ff4089',
				onConfirm: () => void run(true),
			});
			return;
		}
		if (!ready) return;
		setConfirming({
			title: t`Prestige ${name}?`,
			sub: [
				// eslint-disable-next-line @stylistic/max-len
				t`XP Lv${level} → XP Lv0 · Loses every upgrade and all Overdrive · Keeps +${plural(ph({ bonus: prestige + 1 }), {
					one: '# bonus level', other: '# bonus levels', 
				})}, ${plural(ph({ slots: maxUpgrades(prestige + 1) }), {
					one: '# gear slot', other: '# gear slots', 
				})} and x${ph({ multiplier: next.toFixed(2) })} XP`,
				...note ? [note] : [],
			].join(' · '),
			confirmLabel: t`Prestige`,
			color: '#ff4089',
			onConfirm: () => void run(),
		});
	};

	const card = <>
		<HoverCardRow label={<Trans>XP</Trans>}>
			<BigNum value={Math.floor(earned)} theme="heat" /> / <BigNum value={needed} theme="heat" />
		</HoverCardRow>
		{!ready && <HoverCardRow label={<Trans>To go</Trans>}>
			<BigNum value={Math.ceil(needed - earned)} theme="heat" />
		</HoverCardRow>}
		{gain > 0 && <HoverCardRow label={<Trans>Climaxx</Trans>}>
			+{CLIMAXX_SYMBOL}<BigNum value={gain} theme="royal" />
		</HoverCardRow>}
	</>;

	return (
		<div className={`ladder-row ${ready ? 'is-ready' : ''}`}>
			<div className="ladder-row__skill">
				<span className="ladder-row__name">{selectedDef().skillName(skill.name)}</span>
				<span className="ladder-row__lv">
					<Trans>XP Lv<SkillLevel
						level={level} xp={xp} prestige={prestige} lifetimeXp={lifetimeXp} xpLevel
					/></Trans>
				</span>
				<span className={`ladder-row__mult ${prestige > 0 ? '' : 'is-base'}`}>
					<Trans>x{factor} XP</Trans>
				</span>
				{prestige > 0 && <span className="ladder-row__od"><Trans>+{prestige} Lv</Trans></span>}
			</div>
			<HoverCard className="ladder-row__ladder" card={card}>
				<div className="ladder-row__gear">
					<PrestigeDiamonds prestige={prestige} />
					<span className="ladder-row__next">
						<span className="ladder-row__arrow">›</span>
						<Trans>+{ph({ bonus: 1 })} Lv · +{ph({ slots: UPGRADES_PER_PRESTIGE })} gear slot · x{ph({ multiplier: next.toFixed(2) })} XP</Trans>
					</span>
					<span className="ladder-row__count">{at.toFixed(2)} / {required}</span>
				</div>
				<div className={`prestige-bar ${ready ? 'is-ready' : ''}`}>
					<span style={{ transform: `scaleX(${progress})` }} />
				</div>
			</HoverCard>
			<PrestigeAction
				ready={ready}
				forcing={forcing}
				busy={busy}
				required={required}
				gain={gain}
				card={card}
				onConfirm={confirm}
			/>
			{transfer && <PrestigeClimaxxPop {...transfer} onClose={closeTransfer} />}
			{confirming && <ConfirmMenu
				{...confirming}
				onClose={() => setConfirming(undefined)}
			/>}
		</div>
	);
}

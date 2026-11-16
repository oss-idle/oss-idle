import { Trans } from '@lingui/react/macro';

import { Big } from '@oss-idle/shared/big';
import { formatMultiplier } from '@oss-idle/shared/display/num';
import { useSyncedAll } from '@oss-idle/shared/hooks/useSyncedAll';
import SkillState from '@oss-idle/shared/rulesets/skillState';
import {
	canPrestige,
	prestigeXPMultiplier,
} from '@oss-idle/shared/upgrades';

import { selectedDef } from '../../rulesets/registry';

const tally = (skills: SkillState[], locked: boolean) => {
	const rows = skills.map(skill => {
		const state = {
			level: skill.level.get(),
			prestige: skill.prestige.get(),
		};
		return {
			skill,
			prestige: state.prestige,
			ready: !locked && canPrestige(state),
			boost: prestigeXPMultiplier(state.prestige),
		};
	});
	const sum = (pick: (r: typeof rows[number]) => number) =>
		rows.reduce((total, r) => total + pick(r), 0);
	return {
		taken: sum(r => r.prestige),
		ready: sum(r => Number(r.ready)),
		best: rows.reduce((a, b) => (b.boost.gt(a.boost) ? b : a)),
		average: rows.reduce((total, r) => total.add(r.boost), Big.from(0)).div(rows.length),
	};
};

export default function PrestigeSummary({ skills, locked }: {
	skills: SkillState[],
	locked: boolean,
}) {
	useSyncedAll(() => skills.flatMap(s => [s.level, s.prestige]), [skills]);

	const s = tally(skills, locked);
	const best = selectedDef().skillName(s.best.skill.name);

	return (
		<div className="ladder-sum">
			<div className="ladder-sum__stat">
				<span className="ladder-sum__label"><Trans>Prestiges taken</Trans></span>
				<span className="ladder-sum__value">{s.taken}</span>
			</div>
			<div className={`ladder-sum__stat ${s.ready > 0 ? 'is-ready' : ''}`}>
				<span className="ladder-sum__label"><Trans>Ready to prestige</Trans></span>
				<span className="ladder-sum__value">{s.ready}</span>
			</div>
			<div className="ladder-sum__stat">
				<span className="ladder-sum__label"><Trans>Best XP boost</Trans></span>
				<span className="ladder-sum__value">
					{formatMultiplier(s.best.boost)}
					{s.best.prestige > 0 && <span className="ladder-sum__of">{best}</span>}
				</span>
			</div>
			<div className="ladder-sum__stat">
				<span className="ladder-sum__label"><Trans>Average XP boost</Trans></span>
				<span className="ladder-sum__value">{formatMultiplier(s.average)}</span>
			</div>
		</div>
	);
}

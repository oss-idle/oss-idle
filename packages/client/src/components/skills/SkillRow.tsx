import { Trans } from '@lingui/react/macro';

import SkillLevel from '@oss-idle/shared/display/SkillLevel';

import { selectedDef } from '../../rulesets/registry';
import SkillPerk from '../upgrades/SkillPerk';
import SkillEquation from './SkillEquation';
import type { SkillStats } from './skillStats';

/** One skill: what it does, its gear, its XP multiplier part by part, and a bar of what
 *  each source adds. `scale` is the log of the biggest total, the full bar. */
export default function SkillRow({
	s,
	scale,
	lifetimeXp,
}: {
	s: SkillStats,
	scale: number,
	lifetimeXp?: number,
}) {
	const name = s.skill.name;
	const parts = [
		['is-upgrades', s.upgradeBoost],
		['is-prestige', s.prestigeBoost],
		['is-genetics', s.genetics ?? 1],
		['is-medals', s.medals?.multiplier ?? 1],
	] as const;

	return (
		<div className={`skill-row ${s.total > 1 ? '' : 'is-base'}`}>
			<div className="skill-row__skill">
				<span className="skill-row__name">{selectedDef().skillName(name)}</span>
				<span className="skill-row__lv">
					<Trans>Lv<SkillLevel level={s.level} xp={s.xp} prestige={s.prestige} lifetimeXp={lifetimeXp} /></Trans>
				</span>
				<span className="skill-row__desc">{selectedDef().skillDescription(name)}</span>
				<span className="skill-row__gear">
					<span>{selectedDef().upgradeLabel(name, s.upgrades)}</span>
					<span className="skill-row__perk">
						<SkillPerk skill={name} upgrades={s.upgrades} next={s.upgrades} prestige={s.prestige} />
					</span>
				</span>
			</div>
			<div className="skill-row__mult">
				<SkillEquation s={s} />
				<div className="skill-bar">
					{parts.map(([kind, factor]) => factor > 1 && (
						<span key={kind} className={kind} style={{ width: `${Math.log(factor) / scale * 100}%` }} />
					))}
				</div>
			</div>
		</div>
	);
}

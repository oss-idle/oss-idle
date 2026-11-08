import './SkillBar.css';

import { bignum } from '@oss-idle/shared/display/num';
import SkillLevel from '@oss-idle/shared/display/SkillLevel';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import {
	levelProgress,
	xpForLevel,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import { rulesetDef } from '../../rulesets';

export function SkillBar({ ruleset, skill, progress: {
	level, xp, prestige, lifetimeXp,
} }: {
	ruleset: RulesetId,
	skill: string,
	progress: {
		level: number, xp: number, prestige?: number, lifetimeXp?: number
	}
}) {
	// the bar fills toward the next level shown: lifetime's when it is ahead, as the level is
	const lifetime = xpGivesLevel(lifetimeXp ?? 0);
	const ahead = lifetime.level + levelProgress(lifetime.level, lifetime.xp)
		> level + levelProgress(level, xp);
	const at = ahead ? lifetime : {
		level, xp,
	};
	const toNext = xpForLevel(at.level);
	const percent = levelProgress(at.level, at.xp);
	// overall has no prestige to add, so it reads as the xp level either way -
	// but it still earns the hover, and the lifetime behind it
	const overall = String(skill) === 'overall';
	return (
		<li className='skill'>
			<span className='skill__name'>{rulesetDef(ruleset).skillName(skill)}</span>
			<div
				className='skill__track'
				title={
					`${bignum(at.xp)} / ${bignum(toNext)} XP to next level`
				}
			>
				<div className='skill__fill' style={{ width: `${percent*100}%` }} />
			</div>
			<span className='skill__level'>
				<SkillLevel level={level} xp={xp} prestige={prestige} lifetimeXp={lifetimeXp} />
				{overall && <span className='skill__cap'>{level < 100 && '/100'}</span>}
			</span>
			{/* one star per prestige, on a line under the whole row - a count
			    beside the name was too small to read. The line is always there,
			    so one prestiged skill does not make its row taller than the rest. */}
			<span
				className='skill__prestige'
				title={prestige
					? `Prestiged ${prestige} time${prestige === 1 ? '' : 's'}`
					: undefined}
			>{'★'.repeat(prestige ?? 0)}</span>
		</li>
	);
}
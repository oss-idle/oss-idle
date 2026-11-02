import { Trans } from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { SkillGain } from '@oss-idle/shared/play';

import Entities from '../../entity/entities';
import SkillXPBar from '../SkillXPBar';

/** The whole progression - every bar, however many levels each crosses - is done
 *  within this. Bars stagger inside the budget rather than each taking a fixed
 *  time, so a big multi-level play plays out faster, not longer. */
/** Budget, not the ceiling: the real limit is 3s, and the last frame plus the
 *  animationend that starts each fill land a couple hundred ms past whatever we
 *  schedule. */
const TOTAL_MS = 2700;
const START_MS = 300;
const MAX_STAGGER_MS = 900;
/** the row's CSS enter animation, which runs before its fill starts */
const ENTER_MS = 340;
/** the stagger never squeezes a bar below this */
const MIN_BUDGET_MS = 1200;

/** The per-skill XP bars earned this play (sorted biggest-first), or an empty
 *  note. Renders nothing for a failed play or one that awards no XP. */
export default function SkillProgression({ failed, progression, gains }: {
	failed?: boolean;
	progression?: SkillGain[];
	gains: SkillGain[];
}) {
	const [character] = useSynced(Entities.character);

	if (failed || !progression) return null;
	if (gains.length === 0) return <div className="result__skills-empty">
		<Trans>No skill gains</Trans>
	</div>;

	// spread the bars over the first part of the budget, tightening as more of
	// them land so the last one still has time to fill
	const stagger = Math.min(MAX_STAGGER_MS, (TOTAL_MS * 0.5) / gains.length);
	return (
		<div className="result__skills">
			{gains.map((p, i) => {
				const delay = START_MS + i * stagger;
				return <SkillXPBar
					key={p.skill}
					progress={p}
					delay={delay}
					budgetMs={Math.max(MIN_BUDGET_MS, TOTAL_MS - delay - ENTER_MS)}
					prestige={character.skills.find(s => s.name === p.skill)?.prestige.get()}
					lifetimeXp={character.lifetimeXp(p.skill)}
				/>;
			})}
		</div>
	);
}

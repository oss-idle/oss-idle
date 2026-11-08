import { useLingui } from '@lingui/react/macro';

import HoverCardRow from '@oss-idle/shared/display/HoverCardRow';
import { warmupCurve } from '@oss-idle/shared/fatigue';
import {
	rateRange,
	rateUnlocks,
} from '@oss-idle/shared/rate';

import { selectedDef } from '../../rulesets/registry';

const Arrow = () => <span className="ladder-tip__arrow"> → </span>;

const hours = (minutes: number) => {
	const m = Math.round(minutes);
	return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

type Perk = [label: string, value: (upgrades: number) => string];

/** The upgrade tooltip's lines for a skill's own perks: what they give now, and after
 *  the next upgrade. Nothing for a skill without one. */
export default function SkillPerk({
	skill, upgrades, next, prestige,
}: {
	skill: string,
	upgrades: number,
	next: number,
	/** rate steps a prestige keeps */
	prestige: number,
}) {
	const { t } = useLingui();
	const { rateSkill, warmupSkill } = selectedDef();
	const perks: Partial<Record<string, Perk[]>> = {
		...rateSkill && { [rateSkill]: [[t`Rates`, u => rateRange(rateUnlocks(u, prestige))]] },
		...warmupSkill && {
			[warmupSkill]: [
				[t`Warm-up`, u => hours(warmupCurve(u).warm)],
				[t`Peak until`, u => hours(warmupCurve(u).peakEnd)],
			], 
		},
	};
	return perks[skill]?.map(([label, perk]) => {
		const now = perk(upgrades);
		const after = perk(next);
		return <HoverCardRow key={label} label={label}>
			{now}{after !== now && <><Arrow /><span className="ladder-tip__boost">{after}</span></>}
		</HoverCardRow>;
	});
}

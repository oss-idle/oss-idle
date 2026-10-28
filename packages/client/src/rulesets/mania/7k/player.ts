import type { SkillGain } from '@oss-idle/shared/play';
import Bot7k from '@oss-idle/shared/rulesets/mania/7k/bots/character';
import { mania7k } from '@oss-idle/shared/rulesets/mania/7k/index';
import { Skills7k } from '@oss-idle/shared/rulesets/mania/7k/skills';
import { tireSkill7k } from '@oss-idle/shared/rulesets/mania/7k/tiring';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import type { Tiredness } from '../../../online/localPlay';
import type {
	FinishedPlay,
	ManiaPlayer,
	PlayBot,
} from '../../ruleset';

class PlayBot7k extends Bot7k implements PlayBot {
	gains({ chart, game, length, rate, mods, divine, multiplier }: FinishedPlay): SkillGain[] {
		return this.applyProgression(length, xpScore(chart, game, {
			divine, rate, mods,
		}), multiplier, mods);
	}
}

/** 7K's skills at `skills`' progression, tired as given. */
const copyOf = (skills: readonly SkillState[], tired?: Tiredness) => Skills7k.map(name => {
	const skill = new SkillState(name);
	const live = skills.find(s => s.name === name);
	if (live) skill.copy(live);
	if (tired) tireSkill7k(skill, tired.fatigue, tired.warmup);
	return skill;
});

export const player7k: ManiaPlayer = {
	bot: (skills, timesPlayed, tired) => new PlayBot7k(copyOf(skills, tired), timesPlayed),
	debugBot: () => new PlayBot7k(copyOf([])),
	strainGauges: () => mania7k.gauged.map(skill => ({
		skill, label: mania7k.skillName(skill),
	})),
};

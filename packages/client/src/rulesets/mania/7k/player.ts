import type { SkillGain } from '@oss-idle/shared/play';
import Bot7k from '@oss-idle/shared/rulesets/mania/7k/bots/character';
import { mania7k } from '@oss-idle/shared/rulesets/mania/7k/index';
import type { SkillName7k } from '@oss-idle/shared/rulesets/mania/7k/skills';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import type { Tiredness } from '../../../online/localPlay';
import type {
	FinishedPlay,
	ManiaPlayer,
	PlayBot,
} from '../../ruleset';

class PlayBot7k extends Bot7k implements PlayBot {
	gains({
		chart, game, length, rate, mods, divine, multiplier, genetics,
	}: FinishedPlay): SkillGain[] {
		return this.applyProgression(length, xpScore(chart, game, {
			divine, rate, mods,
		}), multiplier, mods, genetics);
	}
}

/** The play `skills` make, tired as given. */
const playOf = (skills: readonly SkillState[], timesPlayed: number, tired?: Tiredness) => ({
	progress: (name: SkillName7k) => {
		const live = skills.find(s => s.name === name) ?? new SkillState(name);
		return {
			...live.state(), lifetimeXp: live.lifetimeXp.get(),
		};
	},
	fatigue: tired?.fatigue ?? 0,
	warm: tired?.warmup ?? 1,
	plays: timesPlayed,
});

export const player7k: ManiaPlayer = {
	bot: (skills, timesPlayed, tired) => new PlayBot7k(playOf(skills, timesPlayed, tired)),
	debugBot: () => new PlayBot7k(playOf([], 0)),
	strainGauges: () => mania7k.gauged.map(skill => ({
		skill, label: mania7k.skillName(skill),
	})),
};

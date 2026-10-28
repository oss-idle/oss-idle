import type { SkillGain } from '@oss-idle/shared/play';
import CharacterBot from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import Memory from '@oss-idle/shared/rulesets/mania/4k/skills/memory';
import { tireSkill } from '@oss-idle/shared/rulesets/mania/4k/tiring';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';
import type SkillState from '@oss-idle/shared/rulesets/skillState';

import type { Tiredness } from '../../../online/localPlay';
import type {
	FinishedPlay,
	ManiaPlayer,
	PlayBot,
} from '../../ruleset';

class Bot4k extends CharacterBot implements PlayBot {
	gains({ chart, game, length, rate, mods, divine, multiplier }: FinishedPlay): SkillGain[] {
		return this.applyProgression(length, xpScore(chart, game, {
			divine, rate, mods,
		}), multiplier, mods);
	}
}

/** 4K's skills at `skills`' progression, memory at `timesPlayed`, tired as given. */
const copyOf = (skills: readonly SkillState[], timesPlayed: number, tired?: Tiredness) =>
	makeOrderedSkills().map(skill => {
		const live = skills.find(s => s.name === skill.name);
		if (live) skill.copy(live);
		if (skill instanceof Memory) void skill.timesPlayed.set(timesPlayed);
		if (tired) tireSkill(skill, tired.fatigue, tired.warmup);
		return skill;
	});

/** Skill level the skin preview's bot plays at. */
const DEBUG_BOT_LEVEL = 0;

export const player4k: ManiaPlayer = {
	bot: (skills, timesPlayed, tired) => new Bot4k(copyOf(skills, timesPlayed, tired)),
	debugBot: () => new Bot4k(makeOrderedSkills(DEBUG_BOT_LEVEL)),
	strainGauges: () => mania4k.gauged.map(skill => ({
		skill, label: mania4k.skillName(skill),
	})),
};

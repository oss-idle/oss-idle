import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';
import {
	SKILL,
	type SkillName,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import type { Judgement } from '@oss-idle/shared/rulesets/mania/judgement';
import { FORGET_PLAYS } from '@oss-idle/shared/rulesets/mania/memoryRecall';

import {
	forgetMemory,
	resetMemory,
} from '../../../db/schema/beatmaps_played';
import { serverRuleset } from '../../ruleset';
import { play } from './play';

export const ruleset = serverRuleset<Judgement, SkillName>(mania4k, play, {
	afterUpgrade: async (r, characterId, skill) => {
		if (skill === SKILL.memory) await forgetMemory(r, characterId, FORGET_PLAYS);
	},
	// memory's progress is the maps it has learned, so that is what its
	// prestige spends - the play counts the profile shows are left alone
	afterPrestige: async (r, characterId, skill) => {
		if (skill === SKILL.memory) await resetMemory(r, characterId);
	},
});

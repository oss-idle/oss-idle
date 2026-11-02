import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';

import type { ClientRuleset } from '../../ruleset';
import { maniaProgression } from '../progression';
import { genetics4k } from './genetics';

export const ruleset: ClientRuleset = {
	def: mania4k,
	progression: maniaProgression,
	genetics: genetics4k,
	player: async () => (await import('./player')).player4k,
};

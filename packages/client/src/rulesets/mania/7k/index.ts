import { mania7k } from '@oss-idle/shared/rulesets/mania/7k/index';

import type { ClientRuleset } from '../../ruleset';
import { maniaProgression } from '../progression';
import { genetics7k } from './genetics';

export const ruleset: ClientRuleset = {
	def: mania7k,
	progression: maniaProgression,
	genetics: genetics7k,
	player: async () => (await import('./player')).player7k,
};

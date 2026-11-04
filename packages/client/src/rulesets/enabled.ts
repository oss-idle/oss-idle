import {
	DEV_RULESETS,
	PBE_RULESETS,
	PROD_RULESETS,
	type RulesetId,
	rulesetOf,
} from '@oss-idle/shared/rulesets/ids';

import { DEV_TOOLS } from '../dev/devTools';
import { PBE } from '../pbe/pbe';

/** The rulesets this build plays: a release build folds the dev ones out. */
export const ENABLED_RULESETS = DEV_TOOLS ? DEV_RULESETS : PBE ? PBE_RULESETS : PROD_RULESETS;

/** The rulesets the client has a game for: mania's engine and stage play both. */
const HAS_ENGINE: readonly RulesetId[] = ['mania4k', 'mania7k'];

/** A chart this build plays. */
export const playable = (mode: number, keys: number) => {
	const ruleset = rulesetOf(mode, keys);
	return ruleset !== undefined && ENABLED_RULESETS.includes(ruleset) && HAS_ENGINE.includes(ruleset);
};

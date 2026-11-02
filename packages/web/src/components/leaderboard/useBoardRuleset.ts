import { useSearch } from '@tanstack/react-router';

import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

/** The ruleset the rankings page shows (`?ruleset=`); the server's first when left out. */
export const useBoardRuleset = () =>
	(useSearch({ strict: false }) as { ruleset?: RulesetId }).ruleset;

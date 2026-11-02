import { nominatesIn } from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { useCurrentUser } from '../../hooks/useCurrentUser';
import {
	ENABLED_RULESETS,
	QUEUED_RULESETS,
	RULESET_TABS,
} from '../../rulesets';

/** The rulesets the requests page offers the viewer: a ruleset players don't have yet shows
 *  to its nominators alone, and `asked` falls back to the first when it isn't among them. */
export const useRequestRulesets = (asked?: RulesetId) => {
	const user = useCurrentUser() ?? undefined;
	const tabs = [...RULESET_TABS, ...QUEUED_RULESETS.filter(id =>
		!ENABLED_RULESETS.includes(id) && nominatesIn(user, id))];
	const ruleset = asked && tabs.includes(asked) ? asked : undefined;
	return {
		tabs, ruleset, shownRuleset: ruleset ?? ENABLED_RULESETS[0],
	};
};

import {
	isAdmin,
	isModerator,
	nominatesIn,
} from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { useCurrentUser } from './useCurrentUser';

export function useAdmin(): boolean {
	return isAdmin(useCurrentUser()?.groups);
}

/** Admins, and the Beatmap Nominators of `ruleset`. */
export function useNominator(ruleset: RulesetId): boolean {
	return nominatesIn(useCurrentUser() ?? undefined, ruleset);
}

/** Admins and the GMT: sanctions and reports. */
export function useModerator(): boolean {
	return isModerator(useCurrentUser()?.groups);
}

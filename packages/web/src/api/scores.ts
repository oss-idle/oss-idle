import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	rpc,
	unwrap,
} from './client';

/** Public: one score with its map, player and rank on the map. A score id is its ruleset's. */
export const getScore = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.scores[':id'].show.$get({
		param: { id: String(id) }, query: { ruleset },
	}));

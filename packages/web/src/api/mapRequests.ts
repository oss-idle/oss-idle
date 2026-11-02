import type { BeatmapRequestStatus } from '@oss-idle/shared/beatmapRequest';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	rpc,
	unwrap,
} from './client';

/** Public: every ranking proposition, with its backers and nomination state. */
export const listMapRequests = (ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request.$get({ query: { ruleset } }));

/** One row of the request queue, inferred from the route. */
export type MapRequest = Awaited<ReturnType<typeof listMapRequests>>[number];

/** Public: the ruleset's sets matching what the player typed, from the beatmap mirror. */
export const searchMapRequests = (q: string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request.search.$get({
		query: {
			q, ruleset,
		},
	}));

/** One search hit, inferred from the route. */
export type MapSearchHit = Awaited<ReturnType<typeof searchMapRequests>>[number];

/** Submit a beatmapset (link or id) for ranking. */
export const submitMapRequest = (map: string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request.$post({
		query: { ruleset }, json: { map },
	}));

/** Back a request, or take the backing away. */
export const toggleMapSupport = (setId: number, ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request[':setId'].support.$post({
		param: { setId: String(setId) }, query: { ruleset },
	}));

/** Withdraw your own open request (admins can drop any). */
export const deleteMapRequest = (setId: number, ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request[':setId'].$delete({
		param: { setId: String(setId) }, query: { ruleset },
	}));

/** Admin: resolve a request, with a reason players can read. */
export const resolveMapRequest = (
	setId: number, status: BeatmapRequestStatus, note?: string, ruleset?: RulesetId,
) =>
	unwrap(rpc.v1.beatmap.request[':setId'].$patch({
		param: { setId: String(setId) },
		query: { ruleset },
		json: {
			status, note,
		},
	}));

/** Admin: pull the .osz off the mirror and push it into the nomination queue. */
export const ingestMapRequest = (setId: number, ruleset?: RulesetId) =>
	unwrap(rpc.v1.beatmap.request[':setId'].ingest.$post({
		param: { setId: String(setId) }, query: { ruleset },
	}));

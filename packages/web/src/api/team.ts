import type { Group } from '@oss-idle/shared/groups';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	rpc,
	unwrap,
} from './client';

/** Admin: every group's members. */
export const getTeam = () => unwrap(rpc.v1.team.$get());

export type TeamMember = Awaited<ReturnType<typeof getTeam>>['members'][number];

export const addToGroup = (group: Group, userId: number) =>
	unwrap(rpc.v1.team[':group'][':userId'].$put({
		param: {
			group, userId: String(userId),
		},
	}));

/** Admin: the rulesets a Beatmap Nominator ranks maps in. */
export const setNominates = (userId: number, rulesets: RulesetId[]) =>
	unwrap(rpc.v1.team.bn[':userId'].rulesets.$put({
		param: { userId: String(userId) }, json: { rulesets },
	}));

export const removeFromGroup = (group: Group, userId: number) =>
	unwrap(rpc.v1.team[':group'][':userId'].$delete({
		param: {
			group, userId: String(userId),
		},
	}));

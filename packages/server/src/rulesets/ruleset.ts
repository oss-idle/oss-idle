import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';

import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';

import {
	requestsTable,
	votesTable,
} from '../db/schema/beatmap_request';
import { playedTable } from '../db/schema/beatmaps_played';
import { setStatusTable } from '../db/schema/beatmapset';
import { bestTable } from '../db/schema/best';
import { bestPpTable } from '../db/schema/best_pp';
import { profileTable } from '../db/schema/character';
import { medalsTable } from '../db/schema/character_medal';
import { progressTable } from '../db/schema/character_progress';
import { totalsTable } from '../db/schema/character_totals';
import { firstPlaceTable } from '../db/schema/first_place';
import {
	levelMapsTable,
	levelVotesTable,
} from '../db/schema/level_vote';
import { matchScoresTable } from '../db/schema/match';
import { scoreTable } from '../db/schema/score';
import { milestonesTable } from '../db/schema/skill_milestone';
import { unrankedScoreTable } from '../db/schema/unranked_score';
import {
	xpGainMapTable,
	xpGainTable,
} from '../db/schema/xp_gain';
import type {
	RulesetPlay,
	RulesetProgression,
} from './play';

/** A ruleset on the server: its definition and its own tables, `<ruleset>_<table>` -
 *  nothing in them is shared with another ruleset. Each table's type-level name is the
 *  same for every ruleset (Drizzle's joins need a literal one); only the SQL name differs,
 *  so a join of them always selects its fields by name, never `.select()`. */
export const serverRuleset = <J extends string, S extends string>(
	def: RulesetDef<J, S>,
	play: RulesetPlay,
	progression?: RulesetProgression,
) => {
	const name = (table: string) => `${def.id}_${table}`;
	const score = scoreTable(name('score'), def.judgements);
	return {
		def: def as RulesetDef,
		play,
		progression,
		score,
		best: bestTable(name('best'), def.judgements, score),
		bestPP: bestPpTable(name('best_pp'), def.judgements, score),
		unrankedScores: unrankedScoreTable(name('unranked_score'), def.judgements),
		firstPlace: firstPlaceTable(name('first_place'), def.judgements, score),
		totals: totalsTable(name('character_totals'), def.judgements),
		progress: progressTable(name('character_progress')),
		medals: medalsTable(name('character_medal')),
		milestones: milestonesTable(name('skill_milestone')),
		played: playedTable(name('beatmaps_played')),
		matchScores: matchScoresTable(name('mp_game_score'), def.judgements),
		profile: profileTable(name('character'), def.skills),
		setStatus: setStatusTable(name('beatmapset_status')),
		requests: requestsTable(name('beatmap_request')),
		requestVotes: votesTable(name('beatmap_request_vote')),
		levelMaps: levelMapsTable(name('level_map')),
		levelVotes: levelVotesTable(name('level_vote')),
		xpGains: xpGainTable(name('xp_gain')),
		xpGainMaps: xpGainMapTable(name('xp_gain_map')),
	};
};

/** What code outside the rulesets sees of a ruleset: its tables' shared columns. */
export type ServerRuleset = ReturnType<typeof serverRuleset<never, never>>;

/** A ruleset-named column (a judgement, a skill's) of one of its tables. */
export const column = (
	table: object,
	name: string,
) => (table as Record<string, AnyMySqlColumn>)[name];

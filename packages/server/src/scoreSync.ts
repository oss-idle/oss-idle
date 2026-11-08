import {
	and,
	asc,
	count,
	eq,
	gt,
	gte,
	inArray,
	lt,
	min,
} from 'drizzle-orm';

import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { ScoreDTO } from '@oss-idle/shared/score';

import { db } from './db/client';
import { characters } from './db/schema/character';
import { toScoreDTO } from './db/schema/score';
import { scoreXpOf } from './db/schema/score_xp';
import { enabledRulesets } from './rulesets/registry';
import type { ServerRuleset } from './rulesets/ruleset';
import {
	SCORE_SYNC_VERSION,
	SCORE_VERSIONS,
} from './sim';

/** Scores in a page of an account's history. */
export const SCORE_PAGE = 5000;

const accountCharacters = async (userId: number) => (await db
	.select({ id: characters.id })
	.from(characters)
	.where(eq(characters.userId, userId))).map(c => c.id);

/** What a client checks its local scores against: whose they are, the server's score
 *  version, how many of the account's ranked scores still wait for the reprocessor, the
 *  account's characters and the rulesets to fetch. */
export const scoreSyncState = async (userId: number) => {
	const ids = await accountCharacters(userId);
	const rulesets = enabledRulesets();
	let pending = 0;
	for (const { def, score } of ids.length ? rulesets : []) {
		const [row] = await db
			.select({ n: count() })
			.from(score)
			.where(and(inArray(score.characterId, ids), lt(score.version, SCORE_VERSIONS[def.id])));
		pending += row?.n ?? 0;
	}
	return {
		userId,
		version: SCORE_SYNC_VERSION,
		pending,
		characters: ids,
		rulesets: rulesets.map(r => r.def.id) as RulesetId[],
	};
};

/** A page of the scores the account's characters stored in `r` after the score id
 *  `after`, oldest first: its ranked scores, or its unranked boards' plays. With
 *  `playedAfter` (epoch ms), from the first one played at or after it instead. */
export const accountScores = async (
	r: ServerRuleset,
	userId: number,
	unranked: boolean,
	after: number,
	playedAfter?: number,
): Promise<{ scores: ScoreDTO[], next?: number }> => {
	const ids = await accountCharacters(userId);
	if (!ids.length) return { scores: [] };
	const t = unranked ? r.unrankedScores : r.score;
	if (playedAfter !== undefined) {
		const [first] = await db
			.select({ id: min(t.id) })
			.from(t)
			.where(and(inArray(t.characterId, ids), gte(t.playedAt, new Date(playedAfter))));
		if (!first?.id) return { scores: [] };
		after = first.id - 1;
	}
	const rows = await db
		.select()
		.from(t)
		.where(and(inArray(t.characterId, ids), gt(t.id, after)))
		.orderBy(asc(t.id))
		.limit(SCORE_PAGE);
	const xp = await scoreXpOf(r, unranked ? [] : rows.map(row => row.id));
	return {
		scores: rows.map(row => {
			const gains = xp.get(row.id);
			return {
				...toScoreDTO(row, r.def, unranked), ...gains && { gains },
			};
		}),
		...rows.length === SCORE_PAGE && { next: rows[rows.length - 1].id },
	};
};

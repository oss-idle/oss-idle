import {
	and,
	asc,
	count,
	eq,
	gt,
	inArray,
	lt,
} from 'drizzle-orm';

import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { ScoreDTO } from '@oss-idle/shared/score';

import { db } from './db/client';
import { characters } from './db/schema/character';
import { toScoreDTO } from './db/schema/score';
import { enabledRulesets } from './rulesets/registry';
import type { ServerRuleset } from './rulesets/ruleset';
import { SCORE_VERSION } from './sim';

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
	for (const { score } of ids.length ? rulesets : []) {
		const [row] = await db
			.select({ n: count() })
			.from(score)
			.where(and(inArray(score.characterId, ids), lt(score.version, SCORE_VERSION)));
		pending += row?.n ?? 0;
	}
	return {
		userId,
		version: SCORE_VERSION,
		pending,
		characters: ids,
		rulesets: rulesets.map(r => r.def.id) as RulesetId[],
	};
};

/** A page of every score the account's characters ever stored in `r`, after the score id
 *  `after`: ranked ones, then unranked ones, whose ids start past every ranked id. */
export const accountScores = async (
	r: ServerRuleset,
	userId: number,
	after: number,
): Promise<{ scores: ScoreDTO[], next?: number }> => {
	const ids = await accountCharacters(userId);
	if (!ids.length) return { scores: [] };
	const ranked = await db
		.select()
		.from(r.score)
		.where(and(inArray(r.score.characterId, ids), gt(r.score.id, after)))
		.orderBy(asc(r.score.id))
		.limit(SCORE_PAGE);
	const unranked = ranked.length < SCORE_PAGE
		? await db
			.select()
			.from(r.unrankedScores)
			.where(and(inArray(r.unrankedScores.characterId, ids), gt(r.unrankedScores.id, after)))
			.orderBy(asc(r.unrankedScores.id))
			.limit(SCORE_PAGE - ranked.length)
		: [];
	const rows = [...ranked, ...unranked];
	return {
		scores: rows.map(row => toScoreDTO(row, r.def)),
		...rows.length === SCORE_PAGE && { next: rows[rows.length - 1].id },
	};
};

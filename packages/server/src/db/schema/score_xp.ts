import { inArray } from 'drizzle-orm';
import {
	int,
	mysqlTable,
} from 'drizzle-orm/mysql-core';

import type { SkillGain } from '@oss-idle/shared/play';

import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { jsonColumn } from '../columns';

/** The XP a ranked play earned, per skill that gained: what song select shows for a map,
 *  whichever device or character ran the play. */
export const scoreXpTable = (name: string) => mysqlTable(name as 'score_xp', {
	scoreId: int().primaryKey(),
	gains: jsonColumn<Record<string, number>>().notNull(),
});

export const storeScoreXp = async (
	r: ServerRuleset,
	scoreId: number,
	gains: readonly SkillGain[],
): Promise<void> => {
	const earned = gains.filter(g => g.gained > 0);
	if (!earned.length) return;
	await db.insert(r.scoreXp).values({
		scoreId, gains: Object.fromEntries(earned.map(g => [g.skill, g.gained])),
	});
};

export const scoreXpOf = async (
	r: ServerRuleset,
	scoreIds: readonly number[],
): Promise<Map<number, Record<string, number>>> => {
	if (!scoreIds.length) return new Map();
	const rows = await db.select().from(r.scoreXp)
		.where(inArray(r.scoreXp.scoreId, [...scoreIds]));
	return new Map(rows.map(row => [row.scoreId, row.gains]));
};

import { eq } from 'drizzle-orm';

import { afterPlay } from '@oss-idle/shared/fatigue';
import { fatigueGenes } from '@oss-idle/shared/genetics';

import { db } from './db/client';
import {
	geneticsOf,
	skillOf,
} from './db/schema/character';
import type { ServerRuleset } from './rulesets/ruleset';

/** Plays are one at a time per character, so the read and write need no lock. */
export const addFatigue = async (
	{ profile, def }: ServerRuleset,
	characterId: number,
	minutes: number,
	strained: number,
	now: number,
) => {
	const [row] = await db.select()
		.from(profile)
		.where(eq(profile.id, characterId))
		.limit(1);
	const genes = row ? fatigueGenes(def.genetics, geneticsOf(row)) : {};
	const upgrades = row && def.warmupSkill ? skillOf(row, def.warmupSkill).upgrades : 0;
	const fatigue = afterPlay(row?.fatigue ?? undefined, minutes, strained, now, genes, upgrades);
	await db.update(profile).set({ fatigue }).where(eq(profile.id, characterId));
};

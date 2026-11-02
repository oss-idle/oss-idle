import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import { Skills7k } from '@oss-idle/shared/rulesets/mania/7k/skills';

import {
	type Column,
	DAO,
	type DaoStatic,
	integer,
	real,
	table,
	text,
} from '../dao';

type ProgressColumns<S extends string> =
	& Record<S, Column<number, true>>
	& Record<`${S}XP`, Column<number, true>>
	& Record<`${S}Upgrades`, Column<number, true>>
	& Record<`${S}Overdrive`, Column<number, true>>
	& Record<`${S}Prestige`, Column<number, true>>
	& Record<`${S}TotalXp`, Column<number, true>>
	& Record<`${S}LifetimeXp`, Column<number, true>>;

/** One column per skill and progression field, grouped by field. */
export const progressColumns = <S extends string>(skills: readonly S[]) => Object.fromEntries(
	([
		['', integer], ['XP', integer], ['Upgrades', integer], ['Overdrive', real],
		['Prestige', integer], ['TotalXp', integer], ['LifetimeXp', integer],
	] as const).flatMap(([field, type]) => skills.map(s => [`${s}${field}`, type().default(0)])),
) as ProgressColumns<S>;

/** What a character has progressed in one ruleset, wherever it is stored. */
export type Progress = {
	overallTotalXp: number,
	overallLevel: number,
	// when memory was last prestiged: plays before it no longer train it
	memoryResetAt: number,
	// JSON list of when memory upgrades were bought: each forgets plays on every map
	memoryForgetAt: string,
	// the genetic and genes in this ruleset, as JSON ('' until one is picked)
	geneticsJson: string,
	add(): Promise<unknown>,
	update(): Promise<unknown>,
};

const rulesetTable = (ruleset: RulesetId, skills: readonly string[]) =>
	table(`character_${ruleset}`, {
		characterId:    integer().primaryKey(),
		...progressColumns(skills),
		overallTotalXp: integer().default(0),
		overallLevel:   integer().default(0),
		memoryResetAt:  integer().default(0),
		memoryForgetAt: text().default('[]'),
		geneticsJson:   text().default(''),
	});

type Tables = Partial<Record<RulesetId, DaoStatic<ReturnType<typeof rulesetTable>['columns']>>>;

const Mania7kProgress = DAO(rulesetTable('mania7k', Skills7k));

/** Each ruleset's local progress table, `character_<ruleset>`; 4K's is the character row. */
export const RULESET_PROGRESS: Tables = { mania7k: Mania7kProgress };

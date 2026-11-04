import {
	and,
	eq,
	or,
	type SQL,
} from 'drizzle-orm';
import type { MySqlColumn } from 'drizzle-orm/mysql-core';

import {
	DEV_RULESETS,
	modesOf,
	NOMINATED_RULESETS,
	OSU_MODE,
	PBE_RULESETS,
	PROD_RULESETS,
	RULESET_IDS,
	type RulesetId,
	rulesetOf,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import {
	isPbe,
	isProd,
} from '../env';

/** The rulesets this server plays; the others' handlers are never loaded. */
export const ENABLED_RULESETS = isPbe ? PBE_RULESETS : isProd ? PROD_RULESETS : DEV_RULESETS;

/** The rulesets whose queue this server keeps: the ones it plays and the nominated ones. */
export const QUEUED_RULESETS = [...new Set([...ENABLED_RULESETS, ...NOMINATED_RULESETS])];

/** The osu! modes some ruleset plays: a set keeps their charts, also where that ruleset
 *  isn't enabled yet, so they are there the day it is. */
export const KNOWN_MODES = modesOf(RULESET_IDS);

/** A chart this server plays. */
export const playable = (mode: number, keys: number) => {
	const ruleset = rulesetOf(mode, keys);
	return ruleset !== undefined && ENABLED_RULESETS.includes(ruleset);
};

/** A chart that can be ranked here: one this server plays, or will. */
export const rankable = (mode: number, keys: number) => {
	const ruleset = rulesetOf(mode, keys);
	return ruleset !== undefined && QUEUED_RULESETS.includes(ruleset);
};

/** {@link playable} as SQL, on any table's mode and key count columns. */
export const playableWhere = (mode: MySqlColumn, keys: MySqlColumn): SQL | undefined =>
	or(...ENABLED_RULESETS.map(id => chartsOf(id, mode, keys)));

/** The charts one ruleset plays, as SQL on any table's mode and key count columns. */
export const chartsOf = (id: RulesetId, mode: MySqlColumn, keys: MySqlColumn): SQL | undefined => {
	const r: { mode: keyof typeof OSU_MODE, keys?: number } = RULESETS[id];
	return r.keys === undefined
		? eq(mode, OSU_MODE[r.mode])
		: and(eq(mode, OSU_MODE[r.mode]), eq(keys, r.keys));
};

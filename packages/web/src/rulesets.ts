import {
	catalogueOf,
	medalById,
	type MedalDef,
} from '@oss-idle/shared/achievements/catalogue';
import {
	DEV_RULESETS,
	NOMINATED_RULESETS,
	PROD_RULESETS,
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';
import { mania4k } from '@oss-idle/shared/rulesets/mania/4k/index';
import { mania7k } from '@oss-idle/shared/rulesets/mania/7k/index';
import { osu } from '@oss-idle/shared/rulesets/osu/index';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';

/** The rulesets this build shows: a release build folds the dev ones out, like the game. */
export const ENABLED_RULESETS = import.meta.env.DEV || import.meta.env.MODE === 'staging'
	? DEV_RULESETS
	: PROD_RULESETS;

/** The rulesets with a nomination queue here, played yet or not. */
export const QUEUED_RULESETS = [...new Set([...ENABLED_RULESETS, ...NOMINATED_RULESETS])];

/** The enabled rulesets as osu! lists its modes beside each other: standard first. */
export const RULESET_TABS = [...ENABLED_RULESETS].sort((a, b) =>
	Number(RULESETS[b].mode === 'osu') - Number(RULESETS[a].mode === 'osu'));

const DEFS: Partial<Record<RulesetId, RulesetDef>> = Object.fromEntries(
	ENABLED_RULESETS.map(id => [id, {
		mania4k, mania7k, osu,
	}[id]]),
);

/** A ruleset the site shows; another falls back to the first, as the server does. */
export const rulesetDef = (id: RulesetId = 'mania4k'): RulesetDef => DEFS[id] ?? mania4k;

/** A medal of any ruleset: a title can be another ruleset's. */
export const anyMedal = (id: string): MedalDef | undefined =>
	Object.values(DEFS).map(def => medalById(def.medals, id)).find(Boolean);

/** Every ruleset's medals: the title is picked among all of them. */
export const allMedals = (): MedalDef[] =>
	Object.values(DEFS).flatMap(def => [...def.medals.medals]);

const catalogues = () => Object.values(DEFS).map(def => def.medals);

/** Any ruleset's medal's name and description: medal ids are unique across rulesets. */
export const medalName = (id: string): string => catalogueOf(catalogues(), id)?.name(id) ?? id;
export const medalDescription = (id: string): string =>
	catalogueOf(catalogues(), id)?.description(id) ?? '';

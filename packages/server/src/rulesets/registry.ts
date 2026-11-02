import { eq } from 'drizzle-orm';

import {
	type RulesetId,
	rulesetOf,
} from '@oss-idle/shared/rulesets/ids';

import { db } from '../db/client';
import { beatmaps } from '../db/schema/beatmap';
import {
	ENABLED_RULESETS,
	QUEUED_RULESETS,
} from './enabled';
import type { ServerRuleset } from './ruleset';

type Loader = () => Promise<{ ruleset: ServerRuleset }>;
const loaders: Record<RulesetId, Loader> = {
	mania4k: () => import('./mania/4k/index'),
	mania7k: () => import('./mania/7k/index'),
	osu: () => import('./osu/index'),
};

const loaded = new Map<RulesetId, ServerRuleset>();
const queued = new Map<RulesetId, ServerRuleset>();

/** Import the rulesets this server plays, and those nominators work on: the others are never
 *  loaded, and one players don't have yet only ever serves its queue.
 *  Runs once before anything serves (boot, a script's start). Not at import time: the
 *  rulesets import modules that import this one. */
export const loadRulesets = async (): Promise<void> => {
	for (const id of QUEUED_RULESETS) {
		const { ruleset } = await loaders[id]();
		queued.set(id, ruleset);
		if (ENABLED_RULESETS.includes(id)) loaded.set(id, ruleset);
	}
};

/** A ruleset this server plays; throws for any other. */
export const rulesetFor = (id: RulesetId): ServerRuleset => {
	const ruleset = loaded.get(id);
	if (!ruleset) throw new Error(`ruleset ${id} is not enabled`);
	return ruleset;
};

/** The ruleset that plays a chart of this mode and key count, when this server plays it. */
export const rulesetOfChart = (mode: number, keys: number): ServerRuleset | undefined => {
	const id = rulesetOf(mode, keys);
	return id === undefined ? undefined : loaded.get(id);
};

/** The ruleset a stored difficulty is played in, when this server plays it. */
export const rulesetOfBeatmap = async (beatmapId: number): Promise<ServerRuleset | undefined> => {
	const [row] = await db.select({
		mode: beatmaps.mode, keys: beatmaps.keys, 
	})
		.from(beatmaps).where(eq(beatmaps.id, beatmapId)).limit(1);
	return row && rulesetOfChart(row.mode, row.keys);
};

/** The ruleset a stored difficulty is ranked in, when it has a queue here. */
export const queueOfBeatmap = async (beatmapId: number): Promise<RulesetId | undefined> => {
	const [row] = await db.select({
		mode: beatmaps.mode, keys: beatmaps.keys, 
	})
		.from(beatmaps).where(eq(beatmaps.id, beatmapId)).limit(1);
	const id = row && rulesetOf(row.mode, row.keys);
	return id && queued.has(id) ? id : undefined;
};

/** A ruleset whose queue this server keeps, played yet or not. */
export const queuedRuleset = (id: RulesetId): ServerRuleset | undefined => queued.get(id);

/** Every ruleset whose queue this server keeps: a set's status is written in all of them. */
export const queuedRulesets = (): ServerRuleset[] => [...queued.values()];

/** Every ruleset this server plays. */
export const enabledRulesets = (): ServerRuleset[] => [...loaded.values()];

/** The ruleset a character picked, or this server's first when it doesn't play that one. */
export const selectedRuleset = (character: { ruleset: RulesetId }): ServerRuleset =>
	loaded.get(character.ruleset) ?? enabledRulesets()[0];

/** A script's `--ruleset <id>`, mania 4k when left out. */
export const rulesetFromArgs = (argv: readonly string[] = process.argv): ServerRuleset => {
	const i = argv.indexOf('--ruleset');
	return rulesetFor((i === -1 ? 'mania4k' : argv[i + 1]) as RulesetId);
};

import {
	catalogueOf,
	medalById,
	type MedalDef,
} from '@oss-idle/shared/achievements/catalogue';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	type RulesetId,
	rulesetOf,
} from '@oss-idle/shared/rulesets/ids';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';

import { ENABLED_RULESETS } from './enabled';
import type {
	ClientGenetics,
	ClientProgression,
	ClientRuleset,
	ManiaPlayer,
} from './ruleset';

// each ruleset is its own chunk, loaded when the player needs it
const loaders: Record<RulesetId, () => Promise<{ ruleset: ClientRuleset }>> = {
	mania4k: () => import('./mania/4k/index'),
	mania7k: () => import('./mania/7k/index'),
	osu: () => import('./osu/index'),
};

const loading = new Map<RulesetId, Promise<ClientRuleset>>();
const loaded = new Map<RulesetId, ClientRuleset>();

/** A ruleset this build plays; another falls back to the first, as the server does. */
export const played = (id: RulesetId): RulesetId =>
	ENABLED_RULESETS.includes(id) ? id : ENABLED_RULESETS[0];

/** Load a ruleset (once). What reads one synchronously runs after this resolved. */
export const loadRuleset = (id: RulesetId): Promise<ClientRuleset> => {
	const key = played(id);
	let load = loading.get(key);
	if (!load) {
		load = loaders[key]().then(({ ruleset }) => {
			loaded.set(key, ruleset);
			return ruleset;
		});
		loading.set(key, load);
	}
	return load;
};

const clientRuleset = (id: RulesetId): ClientRuleset => {
	const ruleset = loaded.get(played(id));
	if (!ruleset) throw new Error(`ruleset ${id} read before it loaded`);
	return ruleset;
};

export const rulesetDef = (id: RulesetId): RulesetDef => clientRuleset(id).def;

/** The ruleset the player picked: song select, the profile and the HUD follow it.
 *  Set only once it has loaded. */
export const selectedRuleset = new Synced<RulesetId>('mania4k');

export const selectedDef = (): RulesetDef => rulesetDef(selectedRuleset.get());

/** In the background: every ruleset this build plays (a title can be any one's medal),
 *  and the picked one's player, so its first play doesn't wait for it. */
export const prefetchRulesets = (): void => {
	for (const id of ENABLED_RULESETS) void loadRuleset(id);
	void loadRuleset(selectedRuleset.get()).then(r => r.player?.());
};

/** {@link selectedDef}, or none while it loads (the boot's placeholder character). */
export const selectedDefLoaded = (): RulesetDef | undefined =>
	loaded.get(played(selectedRuleset.get()))?.def;

/** The picked ruleset's {@link ClientProgression}, when it has one. */
export const selectedProgression = (): ClientProgression | undefined =>
	clientRuleset(selectedRuleset.get()).progression;

/** The picked ruleset's genetics in its own words, when it has genetics. */
export const selectedGenetics = (): ClientGenetics | undefined =>
	loaded.get(played(selectedRuleset.get()))?.genetics;

/** The def of the ruleset a chart is in, once it loaded (its player loads it). */
export const chartDef = (mode: number, keys: number): RulesetDef =>
	rulesetDef(rulesetOf(mode, keys) ?? ENABLED_RULESETS[0]);

const players = new Map<RulesetId, ManiaPlayer>();

/** Load the player of the ruleset a chart is in; none when this device doesn't play it. */
export const loadPlayer = async (mode: number, keys: number): Promise<ManiaPlayer | undefined> => {
	const id = rulesetOf(mode, keys);
	if (id === undefined || !ENABLED_RULESETS.includes(id)) return undefined;
	const player = await (await loadRuleset(id)).player?.();
	if (player) players.set(id, player);
	return player;
};

/** The player of a chart's ruleset, once {@link loadPlayer} loaded it. */
export const playerOf = (mode: number, keys: number): ManiaPlayer | undefined => {
	const id = rulesetOf(mode, keys);
	return id === undefined ? undefined : players.get(id);
};

/** A medal of any loaded ruleset: a title can be another ruleset's. */
export const anyMedal = (id: string): MedalDef | undefined =>
	[...loaded.values()].map(r => medalById(r.def.medals, id)).find(Boolean);

const catalogues = () => [...loaded.values()].map(r => r.def.medals);

/** Any ruleset's medal's name and description: medal ids are unique across rulesets. */
export const medalName = (id: string): string => catalogueOf(catalogues(), id)?.name(id) ?? id;
export const medalDescription = (id: string): string =>
	catalogueOf(catalogues(), id)?.description(id) ?? '';

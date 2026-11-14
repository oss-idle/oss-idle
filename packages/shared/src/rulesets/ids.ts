/** osu!'s rulesets by number, as `.osu` files (`Mode:`) and the osu! API write them. */
export const OSU_MODE = {
	osu: 0,
	taiko: 1,
	fruits: 2,
	mania: 3,
} as const;
export type OsuMode = keyof typeof OSU_MODE;

/** oss!'s rulesets: an osu! ruleset plus its variant, as the osu! API pairs them. */
export const RULESETS = {
	mania4k: {
		mode: 'mania', variant: '4k', keys: 4, 
	},
	mania7k: {
		mode: 'mania', variant: '7k', keys: 7, 
	},
	osu: { mode: 'osu' },
} as const satisfies Record<string, { mode: OsuMode, variant?: string, keys?: number }>;
export type RulesetId = keyof typeof RULESETS;
export const RULESET_IDS = Object.keys(RULESETS) as RulesetId[];

/** The one ruleset a chart is played in (no converts), from its `Mode:` and key
 *  count; none when oss! has no ruleset for it. */
export const rulesetOf = (mode: number, keys: number): RulesetId | undefined =>
	RULESET_IDS.find(id => {
		const r: { mode: OsuMode, keys?: number } = RULESETS[id];
		return OSU_MODE[r.mode] === mode && (r.keys === undefined || r.keys === keys);
	});

/** The rulesets a release build plays. */
export const PROD_RULESETS: readonly RulesetId[] = ['mania4k', 'mania7k'];
/** The rulesets a dev or staging build plays: every one that has an implementation. */
export const DEV_RULESETS: readonly RulesetId[] = ['mania4k', 'mania7k', 'osu'];
/** The rulesets the PBE plays: the release ones and those being tried. */
export const PBE_RULESETS: readonly RulesetId[] = ['mania4k', 'mania7k'];

/** The rulesets nominators rank maps in, also before a release build plays them: the
 *  catalogue is ready the day players get the ruleset. */
export const NOMINATED_RULESETS: readonly RulesetId[] = ['mania4k', 'mania7k'];

/** The osu! `Mode:` numbers of `rulesets`. */
export const modesOf = (rulesets: readonly RulesetId[]): Set<number> =>
	new Set(rulesets.map(id => OSU_MODE[RULESETS[id].mode]));

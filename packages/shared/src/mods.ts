import { z } from 'zod';

import { rateLabel } from './rate.js';

/** osu!'s mods plus our JT and RT, the rate ones (Half/Double) left to rate.ts. In mod select order. */
export const Mods = ['EZ', 'NF', 'HR', 'SD', 'PF', 'JT', 'RT'] as const;
export type Mod = typeof Mods[number];

export const modsSchema = z.array(z.enum(Mods)).max(Mods.length);

/** Mods that can't be on together, as in osu!. */
const EXCLUSIVE: Mod[][] = [['EZ', 'HR'], ['NF', 'SD', 'PF', 'JT']];

/** Mods one ruleset has: RT (Right Thumb) is 7K's middle key on the right hand's thumb;
 *  it changes nothing but which hand the sim gives the key. */
const RULESET_ONLY: Partial<Record<Mod, string>> = { RT: 'mania7k' };

/** `mods` without the ones another ruleset owns. */
export const modsFor = (mods: readonly Mod[], ruleset: string): Mod[] =>
	mods.filter(m => (RULESET_ONLY[m] ?? ruleset) === ruleset);

/** A play with one of these earns no xp and submits nothing. */
const UNRANKED: Mod[] = ['NF'];

/** osu!mania's EZ / HR hit window factor. */
const WINDOW_FACTOR = 1.4;

const SCORE_MULTIPLIER: Partial<Record<Mod, number>> = {
	EZ: 0.3,
	NF: 0.5,
};

const clash = (a: Mod, b: Mod): boolean =>
	EXCLUSIVE.some(set => set.includes(a) && set.includes(b));

/** Known mods, each once, conflicts dropped (the earlier one stays), in mod select order. */
export const cleanMods = (mods: readonly string[]): Mod[] => {
	const kept: Mod[] = [];
	for (const mod of mods) {
		if (!(Mods as readonly string[]).includes(mod) || kept.some(k => clash(k, mod as Mod))) continue;
		kept.push(mod as Mod);
	}
	return Mods.filter(m => kept.includes(m));
};

/** Turn a mod on or off; turning one on turns off what it can't go with. */
export const toggleMod = (mods: readonly Mod[], mod: Mod): Mod[] => mods.includes(mod)
	? mods.filter(m => m !== mod)
	: cleanMods([mod, ...mods]);

export const isRankedMods = (mods: readonly Mod[]): boolean =>
	!mods.some(m => UNRANKED.includes(m));

export const modsScoreMultiplier = (mods: readonly Mod[]): number =>
	mods.reduce((m, mod) => m * (SCORE_MULTIPLIER[mod] ?? 1), 1);

/** What every hit window is multiplied by. */
export const windowScale = (mods: readonly Mod[]): number =>
	mods.includes('EZ') ? WINDOW_FACTOR : mods.includes('HR') ? 1 / WINDOW_FACTOR : 1;

/** SD, PF and JT play the map again on a fail. */
export const retriesOnFail = (mods: readonly Mod[]): boolean =>
	mods.includes('SD') || mods.includes('PF') || mods.includes('JT');

/** EZ's cut on every skill's xp. */
export const EZ_XP = 0.5;

/** What every skill's xp is multiplied by, before a ruleset's own mod bonuses: NF earns
 *  nothing, EZ half. */
export const modXpFactor = (mods: readonly Mod[]): number =>
	isRankedMods(mods) ? mods.includes('EZ') ? EZ_XP : 1 : 0;

/** {@link modXpFactor} on each of `skills`: a ruleset's multipliers with no bonus of its own. */
export const evenModXp = <S extends string>(skills: readonly S[], mods: readonly Mod[]) =>
	Object.fromEntries(skills.map(s => [s, modXpFactor(mods)])) as Record<S, number>;

/** Mods whose plays earn none of the play medals (stars passed, full combos, the score
 *  feats...). A medal made for one of them can still read its plays. */
export const NO_MEDALS: Mod[] = ['EZ', 'NF'];

export const countsForMedals = (mods: readonly Mod[]): boolean =>
	!mods.some(m => NO_MEDALS.includes(m));

/** Mods as osu! writes them: HRSD. */
export const modsLabel = (mods: readonly Mod[]): string => mods.join('');

/** A play's mods with its rate, as song select's Mods button shows them: HRSD x1.2. */
export const playLabel = (mods: readonly Mod[], rate: number): string =>
	[modsLabel(mods), rate === 1 ? '' : rateLabel(rate)].filter(Boolean).join(' ');

/** A playlist lock as its button shows it: x1.2 +HRNF. */
export const lockLabel = (rate: number, mods: readonly Mod[]): string =>
	[rateLabel(rate), mods.length ? `+${modsLabel(mods)}` : ''].filter(Boolean).join(' ');

/** Stored form: "HR,SD". */
export const modsKey = (mods: readonly Mod[]): string => cleanMods(mods).join(',');

export const parseMods = (key = ''): Mod[] => cleanMods(key.split(','));

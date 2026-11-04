import { z } from 'zod';

/** What a gene does outside the play itself. Genes without one act inside the play. */
export type GeneEffect =
	| 'xp'
	| 'overdrive'
	| 'lnXp'
	| 'strainRate'
	| 'restRate'
	| 'warmRate'
	| 'warmHold'
	| 'failShare'
	| 'setShare'
	| 'mapperRate'
	| 'fade'
	| 'favorites'
	| 'keep';

export type Gene = {
	id: string,
	skill: string,
	/** bought first */
	parent?: string,
	/** its last tier */
	max: number,
	effect?: GeneEffect,
	/** the effect's amount per tier */
	per?: number,
};

type GeneRow = [id: string, parent: string, max: number, effect?: GeneEffect, per?: number];

/** A skill's tree: every tree starts with an XP gene and its overdrive gene. */
export const geneTree = (skill: string, xp: string, overdrive: string, rows: GeneRow[]): Gene[] =>
	([
		[xp, '', 5, 'xp', 0.05],
		[overdrive, xp, 5, 'overdrive', 0.05],
		...rows,
	] satisfies GeneRow[]).map(([id, parent, max, effect, per]: GeneRow) => ({
		id,
		skill,
		max,
		...parent ? { parent } : {},
		...effect ? {
			effect, per,
		} : {},
	}));

export type GeneticsDef = {
	/** every skill, in ring order: a skill's neighbours are the ones either side */
	ring: readonly string[],
	genes: readonly Gene[],
};

/** What is kept: climaxx itself is always worked out from it, so a rebalance moves it. */
export const geneticsSchema = z.object({
	/** what the character was born good at: one per generation, each changed on its own */
	picks: z.array(z.object({
		skill: z.string(),
		changedAt: z.number().optional(),
	})),
	genes: z.record(z.string(), z.number()),
	/** each skill's overdrive ever turned into climaxx */
	converted: z.record(z.string(), z.number()),
	/** each skill's selling fees ever paid */
	fees: z.record(z.string(), z.number()),
	/** what medals read, kept by the server: genetics replaced, the last gene learned, and
	 *  whether a gene was ever sold within a minute of learning it */
	changes: z.number().optional(),
	lastLearned: z.object({
		gene: z.string(),
		at: z.number(),
	}).optional(),
	remorse: z.boolean().optional(),
});
export type Genetics = z.infer<typeof geneticsSchema>;

export type GeneticPick = Genetics['picks'][number];

export const NO_GENETICS: Genetics = {
	picks: [],
	genes: {},
	converted: {},
	fees: {},
};

type Saved = Partial<Genetics> & { genetic?: string, changedAt?: number };

/** A character's saved genetics; test builds saved one `genetic` rather than `picks`. */
export const readGenetics = (saved?: Saved | null): Genetics => {
	const { genetic, changedAt, ...rest } = saved ?? {};
	return {
		...NO_GENETICS,
		...genetic ? {
			picks: [{
				skill: genetic, ...changedAt === undefined ? {} : { changedAt },
			}],
		} : {},
		...rest,
	};
};

export const CLIMAXX_SYMBOL = 'λ';
/** Climaxx from overdrive: SCALE x total^EXPONENT over everything a skill ever converted. */
export const CLIMAXX_SCALE = 100;
export const CLIMAXX_EXPONENT = 0.3;
/** A skill's n-th tier (from 0), whatever gene it is on, costs BASE x GROWTH^n. */
export const TIER_BASE_COST = 100;
export const TIER_GROWTH = 1.08;
export const SELL_FEE = 50;
/** Play levels that each pay a skill its next tier: the first ones are free. */
export const MILESTONES = [0, 10, 25, 50, 75, 90, 100] as const;
export const GENETIC_XP_BONUS = 0.1;
/** What each tier bought in a tree adds to its skill's XP. */
export const GENE_XP_BONUS = 0.05;
export const CHANGE_COOLDOWN_MS = 7 * 24 * 3600_000;

export const tierPrice = (n: number): number => Math.round(TIER_BASE_COST * TIER_GROWTH ** n);

/** The first `count` tiers of a skill, summed. */
export const tiersPrice = (count: number): number => {
	let sum = 0;
	for (let n = 0; n < count; n++) sum += tierPrice(n);
	return sum;
};

export const climaxxOfOverdrive = (converted: number): number =>
	Math.floor(CLIMAXX_SCALE * Math.max(0, converted) ** CLIMAXX_EXPONENT);

/** What converting `overdrive` more pays, after `converted` already. */
export const conversionGain = (converted: number, overdrive: number): number =>
	climaxxOfOverdrive(converted + overdrive) - climaxxOfOverdrive(converted);

export const milestonesAt = (playLevel: number): number =>
	MILESTONES.filter(level => level <= playLevel).length;

export const geneOf = (def: GeneticsDef, id: string): Gene | undefined =>
	def.genes.find(g => g.id === id);

export const tierOf = (g: Genetics, id: string): number => g.genes[id] ?? 0;

/** Every tier a skill's genes hold. */
export const tiersHeld = (def: GeneticsDef, g: Genetics, skill: string): number =>
	def.genes.reduce((sum, gene) => sum + (gene.skill === skill ? tierOf(g, gene.id) : 0), 0);

/** Every tier a skill's genes can hold. */
export const tiersMax = (def: GeneticsDef, skill: string): number =>
	def.genes.reduce((sum, gene) => sum + (gene.skill === skill ? gene.max : 0), 0);

/** What the skill's next tier costs, on any of its genes. */
export const nextTierPrice = (def: GeneticsDef, g: Genetics, skill: string): number =>
	tierPrice(tiersHeld(def, g, skill));

/** A skill's climaxx: its overdrive's worth, its milestones' tiers, less fees and what its genes cost. */
export const climaxxOf = (
	def: GeneticsDef,
	g: Genetics,
	skill: string,
	playLevel: number,
): number =>
	climaxxOfOverdrive(g.converted[skill] ?? 0)
	+ tiersPrice(milestonesAt(playLevel))
	- (g.fees[skill] ?? 0)
	- tiersPrice(tiersHeld(def, g, skill));

/** The overdrive, to a tenth, that buys just the climaxx the skill's next tier lacks; none when
 *  the skill already has it or holds every tier. */
export const overdriveForNextTier = (
	def: GeneticsDef,
	g: Genetics,
	skill: string,
	playLevel: number,
): number | undefined => {
	const short = nextTierPrice(def, g, skill) - climaxxOf(def, g, skill, playLevel);
	if (short <= 0 || tiersHeld(def, g, skill) >= tiersMax(def, skill)) return undefined;
	const converted = g.converted[skill] ?? 0;
	const total = ((climaxxOfOverdrive(converted) + short) / CLIMAXX_SCALE) ** (1 / CLIMAXX_EXPONENT);
	let tenths = Math.ceil((total - converted) * 10);
	while (conversionGain(converted, tenths / 10) < short) tenths++;
	return tenths / 10;
};

/** A character gets one genetic per generation. */
export const geneticSlots = (generation: number): number => Math.max(1, generation);

export const pickedSkills = (g: Genetics): string[] => g.picks.map(p => p.skill);

/** A tree's strength: 1 for each pick on it and 0.5 for each pick beside it, added up. */
export const strength = (def: GeneticsDef, picked: readonly string[], skill: string): number => {
	const n = def.ring.length, at = def.ring.indexOf(skill);
	return picked.reduce((sum, p) => {
		if (p === skill) return sum + 1;
		return p === def.ring[(at + 1) % n] || p === def.ring[(at + n - 1) % n] ? sum + 0.5 : sum;
	}, 0);
};

/** Where a tree's strength comes from: each pick on it or beside it, and how much it gives. */
export const strengthSources = (def: GeneticsDef, picked: readonly string[], skill: string) =>
	picked.flatMap(from => {
		const amount = strength(def, [from], skill);
		return amount ? [{
			from, amount, 
		}] : [];
	});

/** Each held gene's tier at its tree's strength: what the play is given. */
export const heldGenes = (def: GeneticsDef, g: Genetics): Record<string, number> => {
	const held: Record<string, number> = {};
	const picked = pickedSkills(g);
	for (const [id, tier] of Object.entries(g.genes)) {
		const gene = geneOf(def, id);
		const n = gene ? tier * strength(def, picked, gene.skill) : 0;
		if (n > 0) held[id] = n;
	}
	return held;
};

/** The summed amount of one effect, from genes of `skill` (any skill when left out). */
export const effectOf = (
	def: GeneticsDef,
	g: Genetics,
	effect: GeneEffect,
	skill?: string,
): number => {
	let amount = 0;
	for (const [id, n] of Object.entries(heldGenes(def, g))) {
		const gene = geneOf(def, id);
		if (gene?.effect !== effect || (skill && gene.skill !== skill)) continue;
		amount += (gene.per ?? 0) * n;
	}
	return amount;
};

/** What genetics' medals count: tiers and maxed genes held, a skill's best climaxx from overdrive,
 *  the fullest tree and the strongest tree in percent, and the trees in reach. */
export const geneticsCounts = (def: GeneticsDef, g: Genetics) => {
	const picked = pickedSkills(g);
	const trees = def.ring.map(skill => ({
		held: tiersHeld(def, g, skill),
		total: tiersMax(def, skill),
		power: strength(def, picked, skill),
		climaxx: climaxxOfOverdrive(g.converted[skill] ?? 0),
	}));
	return {
		tiers: Object.values(g.genes).reduce((sum, tier) => sum + tier, 0),
		maxed: def.genes.filter(gene => tierOf(g, gene.id) >= gene.max).length,
		climaxx: Math.max(...trees.map(t => t.climaxx)),
		fullest: Math.floor(Math.max(...trees.map(t => t.held / t.total)) * 100),
		strongest: Math.round(Math.max(...trees.map(t => t.power)) * 100),
		reached: trees.filter(t => t.power > 0).length,
	};
};

/** What a skill's XP bonus is made of. LN maps' bonus comes on top, on those maps alone. */
export const geneticsXpParts = (def: GeneticsDef, g: Genetics, skill: string) => {
	const tiers = tiersHeld(def, g, skill);
	return {
		genetic: GENETIC_XP_BONUS * strength(def, pickedSkills(g), skill),
		genes: effectOf(def, g, 'xp', skill),
		tiers,
		fromTiers: GENE_XP_BONUS * tiers,
		lnMaps: effectOf(def, g, 'lnXp', skill),
	};
};

export type GeneticsXpParts = ReturnType<typeof geneticsXpParts>;

export const geneticsXpTotal = ({ genetic, genes, fromTiers }: GeneticsXpParts): number =>
	1 + genetic + genes + fromTiers;

/** XP multiplier the genetics give a skill: its strength's bonus, its XP genes, and each tier held. */
export const geneticsXpMultiplier = (def: GeneticsDef, g: Genetics, skill: string): number =>
	geneticsXpTotal(geneticsXpParts(def, g, skill));

export const GENE_REFUSAL = {
	noGenetic: 'noGenetic',
	noSlot: 'noSlot',
	unknown: 'unknown',
	outOfReach: 'outOfReach',
	needsParent: 'needsParent',
	maxed: 'maxed',
	tooPoor: 'tooPoor',
	notHeld: 'notHeld',
	heldChildren: 'heldChildren',
	cooldown: 'cooldown',
	same: 'same',
} as const;
export type GeneRefusal = typeof GENE_REFUSAL[keyof typeof GENE_REFUSAL];

/** Each skill's play level: what its milestones are read from. */
export type PlayLevels = Readonly<Record<string, number>>;

/** Why the next tier of gene `id` can't be bought now, if it can't. */
export const learnRefusal = (
	def: GeneticsDef,
	g: Genetics,
	id: string,
	levels: PlayLevels,
): GeneRefusal | undefined => {
	const gene = geneOf(def, id);
	if (!g.picks.length) return GENE_REFUSAL.noGenetic;
	if (!gene) return GENE_REFUSAL.unknown;
	if (!strength(def, pickedSkills(g), gene.skill)) return GENE_REFUSAL.outOfReach;
	if (gene.parent && !tierOf(g, gene.parent)) return GENE_REFUSAL.needsParent;
	if (tierOf(g, id) >= gene.max) return GENE_REFUSAL.maxed;
	const left = climaxxOf(def, g, gene.skill, levels[gene.skill] ?? 0);
	if (left < nextTierPrice(def, g, gene.skill)) return GENE_REFUSAL.tooPoor;
	return undefined;
};

export const learn = (def: GeneticsDef, g: Genetics, id: string, levels: PlayLevels): Genetics => {
	const refusal = learnRefusal(def, g, id, levels);
	if (refusal) throw new Error(`can't learn ${id}: ${refusal}`);
	return {
		...g, genes: {
			...g.genes, [id]: tierOf(g, id) + 1, 
		}, 
	};
};

export const sellRefusal = (
	def: GeneticsDef,
	g: Genetics,
	id: string,
	levels: PlayLevels,
): GeneRefusal | undefined => {
	const gene = geneOf(def, id);
	if (!gene) return GENE_REFUSAL.unknown;
	if (!tierOf(g, id)) return GENE_REFUSAL.notHeld;
	if (def.genes.some(c => c.parent === id && tierOf(g, c.id))) return GENE_REFUSAL.heldChildren;
	if (climaxxOf(def, dropGene(g, id), gene.skill, levels[gene.skill] ?? 0) < SELL_FEE) {
		return GENE_REFUSAL.tooPoor;
	}
	return undefined;
};

const dropGene = (g: Genetics, id: string): Genetics => {
	const genes = { ...g.genes };
	delete genes[id];
	return {
		...g, genes, 
	};
};

/** Drop every tier of the gene: they come back as climaxx, less the fee. */
export const sell = (def: GeneticsDef, g: Genetics, id: string, levels: PlayLevels): Genetics => {
	const refusal = sellRefusal(def, g, id, levels);
	if (refusal) throw new Error(`can't sell ${id}: ${refusal}`);
	const skill = geneOf(def, id)!.skill;
	const dropped = dropGene(g, id);
	return {
		...dropped, fees: {
			...g.fees, [skill]: (g.fees[skill] ?? 0) + SELL_FEE, 
		}, 
	};
};

/** When a genetic can be changed again; a first pick has no wait. */
export const changeableAt = (p: GeneticPick): number =>
	p.changedAt === undefined ? 0 : p.changedAt + CHANGE_COOLDOWN_MS;

/** `slot` is the genetic to change; left out, the next free one. */
export const pickRefusal = (
	def: GeneticsDef,
	g: Genetics,
	skill: string,
	now: number,
	slots: number,
	slot = g.picks.length,
	/** the PBE lets a genetic change at any time */
	noCooldown = false,
): GeneRefusal | undefined => {
	if (!def.ring.includes(skill)) return GENE_REFUSAL.unknown;
	if (slot < 0 || slot > g.picks.length || slot >= slots) return GENE_REFUSAL.noSlot;
	if (pickedSkills(g).includes(skill)) return GENE_REFUSAL.same;
	const current = g.picks[slot];
	if (current && !noCooldown && now < changeableAt(current)) return GENE_REFUSAL.cooldown;
	return undefined;
};

/** Pick a genetic, or change one: genes and fees of trees now out of reach drop, so their climaxx comes back in full. */
export const pick = (
	def: GeneticsDef,
	g: Genetics,
	skill: string,
	now: number,
	slots: number,
	slot = g.picks.length,
	noCooldown = false,
): Genetics => {
	const refusal = pickRefusal(def, g, skill, now, slots, slot, noCooldown);
	if (refusal) throw new Error(`can't pick ${skill}: ${refusal}`);
	const picks = [...g.picks];
	picks[slot] = {
		skill, ...g.picks[slot] ? { changedAt: now } : {},
	};
	const picked = picks.map(p => p.skill);
	const inReach = (skill: string) => strength(def, picked, skill) > 0;
	return {
		...g,
		picks,
		genes: Object.fromEntries(Object.entries(g.genes).filter(([id]) => {
			const gene = geneOf(def, id);
			return gene && inReach(gene.skill);
		})),
		fees: Object.fromEntries(Object.entries(g.fees).filter(([skill]) => inReach(skill))),
	};
};

/** Turn `overdrive` of a skill into climaxx. */
export const convert = (g: Genetics, skill: string, overdrive: number): Genetics =>
	overdrive > 0
		? {
			...g, converted: {
				...g.converted, [skill]: (g.converted[skill] ?? 0) + overdrive, 
			}, 
		}
		: g;

export const pickBody = z.object({
	skill: z.string(), slot: z.number().int().min(0).optional(),
});
export const geneBody = z.object({ gene: z.string() });
export const convertBody = z.object({ skill: z.string() });

/** What the genes change in fatigue and warm-up. */
export const fatigueGenes = (def: GeneticsDef | undefined, g: Genetics) => (def ? {
	strainRate: effectOf(def, g, 'strainRate'),
	restRate: effectOf(def, g, 'restRate'),
	warmRate: effectOf(def, g, 'warmRate'),
	warmHold: effectOf(def, g, 'warmHold'),
} : {});

/** The quiz's answer: each pick scores its skill 2 and that skill's neighbours 1. The best skill
 *  wins (ties: the most with its neighbours, then ring order); `close` is the runner-up when it is
 *  within a point. */
export const quizResult = (def: GeneticsDef, picks: readonly string[]) => {
	const n = def.ring.length;
	const score = def.ring.map(() => 0);
	for (const skill of picks) {
		const i = def.ring.indexOf(skill);
		if (i < 0) continue;
		score[i] += 2;
		score[(i + 1) % n] += 1;
		score[(i + n - 1) % n] += 1;
	}
	const region = (i: number) => score[i] + score[(i + 1) % n] + score[(i + n - 1) % n];
	const ranked = def.ring.map((_, i) => i)
		.sort((a, b) => score[b] - score[a] || region(b) - region(a) || a - b);
	const [best, next] = ranked;
	return {
		skill: def.ring[best],
		close: score[best] - score[next] <= 1 ? def.ring[next] : undefined,
	};
};

import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { parseMapTags } from '@oss-idle/shared/beatmap';
import {
	convert,
	effectOf,
	type GeneRefusal,
	type Genetics,
	type GeneticsDef,
	geneticSlots,
	geneticsXpMultiplier,
	heldGenes,
	learn,
	learnRefusal,
	overdriveForNextTier,
	pick,
	pickRefusal,
	type PlayLevels,
	sell,
	sellRefusal,
} from '@oss-idle/shared/genetics';
import { playLevelOf } from '@oss-idle/shared/xp';

import { db } from '../db/client';
import { beatmaps } from '../db/schema/beatmap';
import { getRecall } from '../db/schema/beatmaps_played';
import {
	geneticsOf,
	profileOf,
	type ProfileRow,
	skillColumnsFor,
	skillOf,
} from '../db/schema/character';
import { isPbe } from '../env';
import type { ServerRuleset } from '../rulesets/ruleset';

const defOf = (r: ServerRuleset): GeneticsDef => {
	if (!r.def.genetics) throw new HTTPException(409, { message: 'No genetics in this ruleset' });
	return r.def.genetics;
};

/** Each skill's play level: what its milestones read. */
export const playLevels = (r: ServerRuleset, profile: ProfileRow): PlayLevels =>
	Object.fromEntries(r.def.skills.map(s => {
		const {
			level, xp, lifetimeXp, prestige,
		} = skillOf(profile, s);
		return [s, playLevelOf(level, xp, lifetimeXp, prestige)];
	}));

const refuse = (refusal: GeneRefusal | undefined): void => {
	if (refusal) throw new HTTPException(409, { message: refusal });
};

/** Change a profile's genetics under its row lock; `extra` also lands in the same write. */
const changeGenetics = async (
	r: ServerRuleset,
	characterId: number,
	change: (g: Genetics, profile: ProfileRow) => { genetics: Genetics, extra?: Partial<ProfileRow> },
): Promise<void> => {
	await profileOf(r, characterId);
	await db.transaction(async tx => {
		const [profile] = await tx.select().from(r.profile)
			.where(eq(r.profile.id, characterId)).limit(1).for('update');
		if (!profile) throw new HTTPException(409, { message: 'No character' });
		const { genetics, extra } = change(geneticsOf(profile), profile);
		await tx.update(r.profile).set({
			...extra, genetics, 
		}).where(eq(r.profile.id, characterId));
	});
};

/** A gene sold this soon after learning it is regretted. */
const REMORSE_MS = 60_000;

export const performPick = (r: ServerRuleset, characterId: number, skill: string, slot?: number) =>
	changeGenetics(r, characterId, (g, profile) => {
		const def = defOf(r);
		const now = Date.now();
		const slots = geneticSlots(profile.generation);
		refuse(pickRefusal(def, g, skill, now, slots, slot, isPbe));
		const replaces = !!g.picks[slot ?? g.picks.length];
		return {
			genetics: {
				...pick(def, g, skill, now, slots, slot, isPbe),
				...replaces ? { changes: (g.changes ?? 0) + 1 } : {},
			},
		};
	});

export const performLearn = (r: ServerRuleset, characterId: number, gene: string) =>
	changeGenetics(r, characterId, (g, profile) => {
		const def = defOf(r);
		const levels = playLevels(r, profile);
		refuse(learnRefusal(def, g, gene, levels));
		return {
			genetics: {
				...learn(def, g, gene, levels),
				lastLearned: {
					gene, at: Date.now(), 
				},
			},
		};
	});

export const performSell = (r: ServerRuleset, characterId: number, gene: string) =>
	changeGenetics(r, characterId, (g, profile) => {
		const def = defOf(r);
		const levels = playLevels(r, profile);
		refuse(sellRefusal(def, g, gene, levels));
		const { lastLearned } = g;
		const regretted = lastLearned?.gene === gene && Date.now() - lastLearned.at < REMORSE_MS;
		return {
			genetics: {
				...sell(def, g, gene, levels),
				...regretted ? { remorse: true } : {},
			},
		};
	});

/** Turn just the overdrive a skill's next tier needs into climaxx: that much XP boost goes with it. */
export const performConvert = (r: ServerRuleset, characterId: number, skill: string) =>
	changeGenetics(r, characterId, (g, profile) => {
		const def = defOf(r);
		if (!r.def.skills.includes(skill)) throw new HTTPException(400, { message: 'No such skill' });
		const need = overdriveForNextTier(def, g, skill, playLevels(r, profile)[skill] ?? 0);
		if (need === undefined) throw new HTTPException(409, { message: 'Nothing to convert' });
		const { overdrive } = skillOf(profile, skill);
		if (overdrive < need) throw new HTTPException(409, { message: 'Not enough overdrive' });
		return {
			genetics: convert(g, skill, need),
			extra: skillColumnsFor(skill, { overdrive: Math.max(0, overdrive - need) }),
		};
	});

/** Each skill's XP multiplier from the genetics, on a play of `beatmapId`. */
export const geneticsXp = async (
	r: ServerRuleset,
	profile: ProfileRow,
	beatmapId: number,
): Promise<Record<string, number> | undefined> => {
	const def = r.def.genetics;
	const g = geneticsOf(profile);
	if (!def || !g.picks.length) return undefined;
	const [map] = await db.select({ tags: beatmaps.tags }).from(beatmaps)
		.where(eq(beatmaps.id, beatmapId)).limit(1);
	const ln = map ? parseMapTags(map.tags).includes('ln') : false;
	return Object.fromEntries(r.def.skills.map(s => [
		s,
		geneticsXpMultiplier(def, g, s) + (ln ? effectOf(def, g, 'lnXp', s) : 0),
	]));
};

/** What a play is given of the genetics: the genes held, and the map as they remember it. */
export const geneInput = async (r: ServerRuleset, profile: ProfileRow, beatmapId: number) => {
	const def = r.def.genetics;
	const g = geneticsOf(profile);
	if (!def || !g.picks.length) return {};
	return {
		genes: heldGenes(def, g), ...await getRecall(r, profile.id, beatmapId), 
	};
};

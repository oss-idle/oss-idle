import {
	climaxxOf,
	type Genetics,
	nextTierPrice,
	overdriveForNextTier,
} from '@oss-idle/shared/genetics';
import { GENETICS_4K } from '@oss-idle/shared/rulesets/mania/4k/genes';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import type { SkillName7k } from '@oss-idle/shared/rulesets/mania/7k/skills';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import Character from '../db/schema/character';

type Seed = [level: number, upgrades: number, overdrive: number, prestige: number];

/** Every state a row can be in: ready, short of the level, maxed, past the
 *  base ladder on a prestige, overdriven, untouched. */
const SEEDS: Record<SkillName, Seed> = {
	accuracy: [101, 10, 4.2, 1],
	speed: [64, 5, 0, 7],
	stamina: [47, 4, 1.3, 0],
	jackspeed: [33, 3, 0, 0],
	coordination: [88, 2, 0, 0],
	release: [12, 0, 0, 0],
	reading: [100, 10, 2.6, 0],
	consistency: [25, 2, 0, 0],
	concentration: [8, 0, 0, 0],
	speedjam: [41, 3, 0, 0],
	memory: [101, 11, 3.1, 2],
};

const SEEDS_7K: Record<SkillName7k, Seed> = {
	accuracy: [101, 10, 4.2, 1],
	speed: [64, 5, 0, 7],
	stamina: [47, 4, 1.3, 0],
	jacks: [33, 3, 0, 0],
	independence: [88, 2, 0, 0],
	ln: [12, 0, 0, 0],
	technical: [100, 10, 2.6, 0],
	focus: [25, 2, 0, 0],
	sv: [41, 3, 0, 0],
	memory: [101, 11, 3.1, 2],
};

const SEED_OF: Record<string, Seed> = {
	...SEEDS, ...SEEDS_7K,
};

export const sampleCharacter = () => {
	const character = new Character({
		id: -1, name: 'Adri', local: 1, 
	} as never);
	for (const skill of character.skills) {
		const [level, upgrades, overdrive, prestige] = SEED_OF[skill.name];
		void skill.level.set(level);
		void skill.xp.set(SkillState.xpForLevel(level) * 0.4);
		void skill.upgrades.set(upgrades);
		void skill.overdrive.set(overdrive);
		void skill.prestige.set(prestige);
	}
	return character;
};

/** A speed genetic a few days in: some genes, one maxed, a neighbour's started. */
const SAMPLE_GENETICS: Genetics = {
	picks: [{ skill: 'speed' }],
	genes: {
		adrenaline: 3, rush: 5, quickFingers: 1, pacing: 2, burst: 5, independence: 2, handSplit: 1, longSets: 1,
	},
	converted: {
		speed: 300, stamina: 30, 
	},
	fees: {},
};

export const sampleGeneticCharacter = (genetics: Genetics = SAMPLE_GENETICS, generation = 1) => {
	const character = sampleCharacter();
	character.generation = generation;
	void character.genetics.set(genetics);
	return character;
};

/** Reborn once, its two genetics side by side: both trees at 150%, one still changing. */
export const REBORN_GENETICS: Genetics = {
	...SAMPLE_GENETICS,
	picks: [{ skill: 'speed' }, {
		skill: 'stamina', changedAt: Date.now() - 86_400_000, 
	}],
};

/** 7K's speed genetic a few days in, as {@link SAMPLE_GENETICS}. */
export const SAMPLE_GENETICS_7K: Genetics = {
	picks: [{ skill: 'speed' }],
	genes: {
		adrenaline: 3, rush: 5, quickFingers: 1, pacing: 2, rollingHands: 5, chordPress: 2, splitFocus: 2, longSets: 1,
	},
	converted: {
		speed: 300, stamina: 30,
	},
	fees: {},
};

/** Speed λ30 short of its next tier, holding `share` of the overdrive that tier needs. */
export const convertingCharacter = (share: number) => {
	const character = sampleGeneticCharacter();
	const speed = character.skills.find(s => s.name === 'speed')!;
	const level = speed.playLevel();
	const short = nextTierPrice(GENETICS_4K, SAMPLE_GENETICS, 'speed') - 30;
	const genetics = {
		...SAMPLE_GENETICS,
		fees: { speed: climaxxOf(GENETICS_4K, SAMPLE_GENETICS, 'speed', level) - short },
	};
	void character.genetics.set(genetics);
	const need = overdriveForNextTier(GENETICS_4K, genetics, 'speed', level) ?? 0;
	void speed.overdrive.set(need * share);
	return character;
};

/** Overdrive from a few σ to millions, and a large speed climaxx. */
export const bigNumbersCharacter = () => {
	const character = sampleGeneticCharacter({
		...SAMPLE_GENETICS,
		converted: {
			speed: 40_000_000, stamina: 30, 
		},
	});
	const overdrives = [4.2, 0, 1830, 0, 0, 0, 52_400, 0, 0, 0, 3_400_000];
	character.skills.forEach((skill, i) => void skill.overdrive.set(overdrives[i] ?? 0));
	return character;
};

import type { Genetics } from '@oss-idle/shared/genetics';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
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

export const sampleCharacter = () => {
	const character = new Character({
		id: -1, name: 'Adri', local: 1, 
	} as never);
	for (const skill of character.skills) {
		const [level, upgrades, overdrive, prestige] = SEEDS[skill.name as SkillName];
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

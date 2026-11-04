import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	CHANGE_COOLDOWN_MS,
	climaxxOf,
	climaxxOfOverdrive,
	conversionGain,
	convert,
	effectOf,
	GENE_REFUSAL,
	type Genetics,
	geneticsCounts,
	geneticSlots,
	geneticsXpMultiplier,
	geneticsXpParts,
	heldGenes,
	learn,
	learnRefusal,
	milestonesAt,
	NO_GENETICS,
	overdriveForNextTier,
	pick,
	pickRefusal,
	quizResult,
	readGenetics,
	sell,
	SELL_FEE,
	sellRefusal,
	strength,
	strengthSources,
	tierPrice,
	tiersPrice,
} from '@oss-idle/shared/genetics';
import {
	GENES,
	GENETICS_4K,
	RING,
} from '@oss-idle/shared/rulesets/mania/4k/genes';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';

const def = GENETICS_4K;
const levels = {
	speed: 0, stamina: 0, coordination: 0, 
};
const rich = (g: Genetics, skill: string): Genetics =>
	({
		...g, converted: {
			...g.converted, [skill]: 1e6, 
		}, 
	});
const speed = rich(pick(def, NO_GENETICS, 'speed', 0, 1), 'speed');
const left = (g: Genetics, skill = 'speed', level = 0) => climaxxOf(def, g, skill, level);

describe('gene catalogue', () => {
	it('has every skill on the ring once', () => {
		expect([...RING].sort()).toEqual([...Skills].sort());
	});

	it('has unique ids, known parents in the same tree', () => {
		expect(new Set(GENES.map(g => g.id)).size).toBe(GENES.length);
		for (const gene of GENES.filter(g => g.parent)) {
			expect(GENES.find(g => g.id === gene.parent)?.skill).toBe(gene.skill);
		}
	});
});

describe('strength', () => {
	it('is full on the genetic, half on its neighbours, none elsewhere', () => {
		expect(strength(def, ['speed'], 'speed')).toBe(1);
		expect(strength(def, ['speed'], 'coordination')).toBe(0.5);
		expect(strength(def, ['speed'], 'stamina')).toBe(0.5);
		expect(strength(def, ['speed'], 'memory')).toBe(0);
		expect(strength(def, ['accuracy'], 'concentration')).toBe(0.5);
		expect(strength(def, [], 'speed')).toBe(0);
	});

	it('adds up across genetics: two picked siblings are at 150% each', () => {
		expect(strength(def, ['speed', 'stamina'], 'speed')).toBe(1.5);
		expect(strength(def, ['speed', 'stamina'], 'stamina')).toBe(1.5);
		expect(strength(def, ['speed', 'stamina'], 'coordination')).toBe(0.5);
		// a tree between two picks
		expect(strength(def, ['coordination', 'stamina'], 'speed')).toBe(1);
		expect(strength(def, ['coordination', 'speed', 'stamina'], 'speed')).toBe(2);
	});

	it('tells where a strength comes from', () => {
		expect(strengthSources(def, ['speed', 'stamina', 'memory'], 'speed')).toEqual([
			{
				from: 'speed', amount: 1, 
			}, {
				from: 'stamina', amount: 0.5, 
			},
		]);
	});

	it('gives held genes their added strength', () => {
		const g = rich(learn(def, pick(def, speed, 'stamina', 0, 2), 'pacing', levels), 'speed');
		expect(heldGenes(def, g).pacing).toBe(1.5);
	});
});

describe('climaxx', () => {
	it('grows slower than overdrive, and splitting a conversion gains nothing', () => {
		expect(conversionGain(0, 10_000)).toBeLessThan(10_000 * conversionGain(0, 1));
		let split = NO_GENETICS;
		for (let i = 0; i < 100; i++) split = convert(split, 'speed', 1);
		expect(left(split)).toBe(left(convert(NO_GENETICS, 'speed', 100)));
	});

	it('asks just the overdrive, to a tenth, that the next tier lacks', () => {
		const poor = pick(def, NO_GENETICS, 'speed', 0, 1);
		expect(overdriveForNextTier(def, poor, 'speed', 0)).toBeUndefined();
		for (const converted of [0, 3.7, 250, 1e5]) {
			const g = {
				...convert(learn(def, poor, 'pacing', levels), 'speed', converted),
				fees: { speed: climaxxOfOverdrive(converted) + 1 },
			};
			const short = tierPrice(1) - left(g);
			const need = overdriveForNextTier(def, g, 'speed', 0)!;
			expect(conversionGain(converted, need)).toBeGreaterThanOrEqual(short);
			expect(conversionGain(converted, need - 0.1)).toBeLessThan(short);
			expect(overdriveForNextTier(def, convert(g, 'speed', need), 'speed', 0)).toBeUndefined();
		}
	});

	it('pays one tier per milestone reached', () => {
		expect(milestonesAt(0)).toBe(1);
		expect(milestonesAt(49)).toBe(3);
		expect(milestonesAt(250)).toBe(7);
		expect(left(NO_GENETICS, 'speed', 30)).toBe(tiersPrice(3));
	});

	it('makes the milestone tiers free', () => {
		let g = pick(def, NO_GENETICS, 'speed', 0, 1);
		for (let i = 0; i < 3; i++) g = learn(def, g, 'pacing', { speed: 30 });
		expect(left(g, 'speed', 30)).toBe(0);
		expect(learnRefusal(def, g, 'pacing', { speed: 30 })).toBe(GENE_REFUSAL.tooPoor);
	});
});

describe('learning and selling', () => {
	it('needs a genetic, reach, the parent and the price', () => {
		expect(learnRefusal(def, NO_GENETICS, 'pacing', levels)).toBe(GENE_REFUSAL.noGenetic);
		expect(learnRefusal(def, speed, 'steady', levels)).toBe(GENE_REFUSAL.outOfReach);
		expect(learnRefusal(def, speed, 'burst', levels)).toBe(GENE_REFUSAL.needsParent);
		expect(learnRefusal(def, speed, 'pacing', levels)).toBeUndefined();
	});

	it('prices tiers by how many the skill holds, whatever the gene', () => {
		const once = learn(def, speed, 'pacing', levels);
		const twice = learn(def, once, 'quickFingers', levels);
		expect(left(speed) - left(once)).toBe(tierPrice(0));
		expect(left(once) - left(twice)).toBe(tierPrice(1));
	});

	it('stops at the max', () => {
		let g = speed;
		for (let t = 0; t < 5; t++) g = learn(def, g, 'pacing', levels);
		expect(learnRefusal(def, g, 'pacing', levels)).toBe(GENE_REFUSAL.maxed);
	});

	it('sells every tier back less the fee, never under a held child', () => {
		const buy = (from: Genetics, id: string) => learn(def, from, id, levels);
		const g = buy(buy(buy(speed, 'pacing'), 'pacing'), 'burst');
		expect(sellRefusal(def, g, 'pacing', levels)).toBe(GENE_REFUSAL.heldChildren);
		const sold = sell(def, sell(def, g, 'burst', levels), 'pacing', levels);
		expect(sold.genes).toEqual({});
		expect(left(sold)).toBe(left(speed) - 2 * SELL_FEE);
	});

	it('gives neighbours half the tiers', () => {
		const g = learn(def, learn(def, rich(speed, 'stamina'), 'longSets', levels), 'adrenaline', levels);
		expect(heldGenes(def, g)).toEqual({
			longSets: 0.5, adrenaline: 1, 
		});
		expect(effectOf(def, g, 'strainRate')).toBeCloseTo(0.025);
		// the genetic 10%, adrenaline's XP gene is not one of these: longSets on stamina, adrenaline on speed
		const xpGene = effectOf(def, g, 'xp', 'speed');
		expect(geneticsXpMultiplier(def, g, 'speed')).toBeCloseTo(1 + 0.1 + xpGene + 0.05);
	});

	it('breaks the XP bonus down into what makes it up', () => {
		const g = learn(def, learn(def, speed, 'adrenaline', levels), 'pacing', levels);
		const parts = geneticsXpParts(def, g, 'speed');
		expect(parts).toMatchObject({
			genetic: 0.1, tiers: 2, 
		});
		expect(parts.genes).toBeCloseTo(0.05);
		expect(parts.fromTiers).toBeCloseTo(0.1);
		expect(geneticsXpMultiplier(def, g, 'speed')).toBeCloseTo(1.25);
	});

	it('gives the genetic\'s XP bonus at each tree\'s strength', () => {
		expect(geneticsXpMultiplier(def, speed, 'speed')).toBeCloseTo(1.1);
		expect(geneticsXpMultiplier(def, speed, 'stamina')).toBeCloseTo(1.05);
		expect(geneticsXpMultiplier(def, speed, 'memory')).toBeCloseTo(1);
		const both = pick(def, speed, 'stamina', 0, 2);
		expect(geneticsXpMultiplier(def, both, 'speed')).toBeCloseTo(1.15);
		expect(geneticsXpMultiplier(def, both, 'coordination')).toBeCloseTo(1.05);
	});

	it('adds 5% skill XP per tier bought, on that skill alone', () => {
		const base = geneticsXpMultiplier(def, speed, 'speed');
		const one = learn(def, speed, 'pacing', levels);
		expect(geneticsXpMultiplier(def, one, 'speed')).toBeCloseTo(base + 0.05);
		const tier2 = learn(def, one, 'pacing', levels);
		expect(geneticsXpMultiplier(def, tier2, 'speed')).toBeCloseTo(base + 0.1);
		const two = learn(def, tier2, 'quickFingers', levels);
		expect(geneticsXpMultiplier(def, two, 'speed')).toBeCloseTo(base + 0.15);
		expect(geneticsXpMultiplier(def, two, 'memory')).toBeCloseTo(1);
	});
});

describe('what medals count', () => {
	it('counts tiers, maxed genes, climaxx, the fullest and strongest tree, and reach', () => {
		const g = {
			...speed, genes: {
				adrenaline: 5, pacing: 2, 
			}, converted: {
				speed: 1000, memory: 10, 
			}, 
		};
		const counts = geneticsCounts(def, g);
		expect(counts).toMatchObject({
			tiers: 7, maxed: 1, strongest: 100, reached: 3, 
		});
		expect(counts.climaxx).toBe(climaxxOfOverdrive(1000));
		expect(counts.fullest).toBe(Math.floor(7 / 50 * 100));
		const siblings = pick(def, speed, 'stamina', 0, 2);
		expect(geneticsCounts(def, siblings).strongest).toBe(150);
		expect(geneticsCounts(def, siblings).reached).toBe(4);
	});
});

describe('picking a genetic', () => {
	it('drops the genes now out of reach, so the climaxx comes back, and starts the cooldown', () => {
		const g = learn(def, learn(def, speed, 'pacing', levels), 'pacing', levels);
		const changed = pick(def, g, 'memory', 10, 1, 0);
		expect(changed.genes).toEqual({});
		expect(left(changed)).toBe(left(speed));
		const tooSoon = 10 + CHANGE_COOLDOWN_MS - 1;
		expect(pickRefusal(def, changed, 'speed', tooSoon, 1, 0)).toBe(GENE_REFUSAL.cooldown);
		expect(pickRefusal(def, changed, 'speed', 10 + CHANGE_COOLDOWN_MS, 1, 0)).toBeUndefined();
	});

	it('skips the cooldown only when told to, as the PBE does', () => {
		const changed = pick(def, speed, 'memory', 10, 1, 0);
		expect(pickRefusal(def, changed, 'speed', 11, 1, 0)).toBe(GENE_REFUSAL.cooldown);
		expect(pickRefusal(def, changed, 'speed', 11, 1, 0, true)).toBeUndefined();
		expect(pick(def, changed, 'speed', 11, 1, 0, true).picks[0]).toEqual({
			skill: 'speed', changedAt: 11,
		});
	});

	it('keeps the genes of trees still in reach', () => {
		const g = learn(def, pick(def, speed, 'memory', 0, 2), 'pacing', levels);
		// speed stays in reach from stamina, beside it
		const changed = pick(def, g, 'stamina', 10, 2, 0);
		expect(changed.genes.pacing).toBe(1);
	});

	it('resets the fees of trees now out of reach', () => {
		const sold = sell(def, learn(def, speed, 'pacing', levels), 'pacing', levels);
		expect(pick(def, sold, 'memory', 10, 1, 0).fees).toEqual({});
		expect(pick(def, pick(def, sold, 'memory', 0, 2), 'stamina', 10, 2, 1).fees).toEqual(sold.fees);
	});

	it('lets the first pick change at once', () => {
		expect(pickRefusal(def, pick(def, NO_GENETICS, 'speed', 0, 1), 'memory', 1, 1, 0)).toBeUndefined();
	});

	it('gives one genetic per generation', () => {
		expect(geneticSlots(1)).toBe(1);
		expect(geneticSlots(3)).toBe(3);
		const one = pick(def, NO_GENETICS, 'speed', 0, 1);
		expect(pickRefusal(def, one, 'memory', 0, 1)).toBe(GENE_REFUSAL.noSlot);
		expect(pickRefusal(def, one, 'memory', 0, 2)).toBeUndefined();
	});

	it('refuses a skill already picked', () => {
		const one = pick(def, NO_GENETICS, 'speed', 0, 2);
		expect(pickRefusal(def, one, 'speed', 0, 2)).toBe(GENE_REFUSAL.same);
	});

	it('runs each cooldown apart', () => {
		const two = pick(def, pick(def, NO_GENETICS, 'speed', 0, 2), 'memory', 0, 2);
		const changed = pick(def, two, 'stamina', 10, 2, 0);
		expect(pickRefusal(def, changed, 'coordination', 11, 2, 0)).toBe(GENE_REFUSAL.cooldown);
		expect(pickRefusal(def, changed, 'coordination', 11, 2, 1)).toBeUndefined();
	});

	it('reads what test builds saved as one genetic', () => {
		expect(readGenetics({
			genetic: 'speed', changedAt: 5, 
		} as never).picks).toEqual([{
			skill: 'speed', changedAt: 5, 
		}]);
		expect(readGenetics(undefined).picks).toEqual([]);
	});
});

describe('the quiz', () => {
	it('picks the skill the answers point at most', () => {
		const picks = ['speed', 'speed', 'stamina', 'memory', 'speed', 'reading'];
		expect(quizResult(def, picks).skill).toBe('speed');
	});

	it('calls it close when the runner-up is within a point', () => {
		const result = quizResult(def, ['speed', 'memory']);
		expect(result.close).toBeDefined();
	});
});

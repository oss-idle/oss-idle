import {
	describe,
	expect,
	it,
} from 'vitest';

import type { Genetics } from '@oss-idle/shared/genetics';
import { GENETICS_4K } from '@oss-idle/shared/rulesets/mania/4k/genes';

import {
	geneticsState,
	learnableGenes,
} from '@oss-idle/client/addons/genes';

const born = (genes: Record<string, number> = {}): Genetics => ({
	picks: [{ skill: 'coordination' }], genes, converted: {}, fees: {},
});
const name = (id: string) => id.toUpperCase();
const does = (id: string, n: number) => `${id} x${n}`;
const learnable = (genetics: Genetics, levels = {}, local = false) =>
	learnableGenes(GENETICS_4K, genetics, levels, {
		name, does, 
	}, local);
const ids = (genetics: Genetics, levels = {}, local = false) =>
	learnable(genetics, levels, local).map(gene => gene.id);
const skillOf = (id: string) => GENETICS_4K.genes.find(gene => gene.id === id)?.skill;

describe('learnableGenes', () => {
	it('lists the first genes of the genetic and its neighbours, paid by the first milestone', () => {
		expect(ids(born())).toEqual([
			'tailChaser', 'lightTouch', 'lnFlow',
			'ambidextrous', 'independence', 'composure',
			'adrenaline', 'quickFingers', 'pacing', 'topSpeed',
		]);
	});

	it('gives each gene its name, skill, next tier, price and what it would do', () => {
		expect(learnable(born()).find(gene => gene.id === 'composure')).toEqual({
			id: 'composure', name: 'COMPOSURE', skill: 'coordination', tier: 1, price: 100, does: 'composure x1',
		});
		// a neighbour's tree works at half strength
		expect(learnable(born()).find(gene => gene.id === 'pacing')?.does).toBe('pacing x0.5');
	});

	it('leaves out a skill whose climaxx is spent, until its next milestone', () => {
		const one = born({ ambidextrous: 1 });
		expect(ids(one).filter(id => skillOf(id) === 'coordination')).toEqual([]);
		expect(ids(one, { coordination: 10 })).toContain('twoMinds');
		const again = learnable(one, { coordination: 10 }).find(gene => gene.id === 'ambidextrous');
		expect(again?.tier).toBe(2);
	});

	it('keeps to the genes a local character can use', () => {
		expect(ids(born(), {}, true)).toEqual(['tailChaser', 'ambidextrous', 'adrenaline']);
	});
});

describe('geneticsState', () => {
	const state = (genetics: Genetics, levels = {}) => geneticsState(GENETICS_4K, genetics, levels, {
		name, does,
	});

	it('says what the character was born for, and every skill\'s climaxx in ring order', () => {
		const whole = state(born());
		expect(whole.picks).toEqual(['coordination']);
		expect(whole.skills.map(row => row.skill)).toEqual([...GENETICS_4K.ring]);
		// the first milestone pays one tier on every skill
		expect(whole.skills.every(row => row.climaxx === '100')).toBe(true);
	});

	it('lists every gene with the tier it holds, its last tier and the gene learned before it', () => {
		const whole = state(born({ ambidextrous: 2 }), { coordination: 10 });
		expect(whole.genes).toHaveLength(GENETICS_4K.genes.length);
		expect(whole.genes.find(gene => gene.id === 'ambidextrous')).toEqual({
			id: 'ambidextrous', name: 'AMBIDEXTROUS', skill: 'coordination', tier: 2, max: 5, does: 'ambidextrous x2',
		});
		// not learned: tier 0, and what it would do at its first
		const next = whole.genes.find(gene => gene.parent === 'ambidextrous');
		expect(next).toMatchObject({
			tier: 0, skill: 'coordination', 
		});
		expect(next?.does).toBe(`${next?.id} x1`);
	});
});

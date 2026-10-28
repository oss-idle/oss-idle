import {
	beforeAll,
	describe,
	expect,
	it,
} from 'vitest';

import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';

import { simulateState } from '../../server/src/rulesets/mania/4k/simState';
import { loadSim } from '../../server/src/sim';
import { checksumOf } from '../../server/src/simCharts';
import {
	CHARTS,
	fetchChart,
} from './balancing/charts';

/** The sim API's play: a character state, no database. */

const at = (level: number) => ({
	generation: 1,
	strainMinutes: 60,
	mapPlays: 0,
	skills: Object.fromEntries(Skills.map(s => [s, {
		level, xp: 0, lifetimeXp: 0, prestige: 0, upgrades: 0, overdrive: 0,
	}])),
});

const total = (xp: Record<string, number>) => Object.values(xp).reduce((a, b) => a + b, 0);

describe('a play simulated from a character state', () => {
	let easy: string;
	let hard: string;
	beforeAll(async () => {
		process.env.SIM = 'public';
		await loadSim();
		easy = await fetchChart(CHARTS['2-air']);
		hard = await fetchChart(CHARTS['6-shaper']);
	});

	it('earns pp and xp when it passes', () => {
		const play = simulateState({
			checksum: checksumOf(easy), state: at(20), rate: 1, mods: [],
		}, easy);
		expect(play.passed).toBe(true);
		expect(play.failProgress).toBeUndefined();
		expect(play.pp).toBeGreaterThan(0);
		expect(total(play.xp)).toBeGreaterThan(0);
		expect(play.strainedMinutes).toBeGreaterThan(0);
		expect(Object.keys(play.xp).sort()).toEqual([...Skills].sort());
	});

	it('earns nothing when it fails, and says where', () => {
		const play = simulateState({
			checksum: checksumOf(hard), state: at(0), rate: 1, mods: [],
		}, hard);
		expect(play.passed).toBe(false);
		expect(play.failProgress).toBeGreaterThan(0);
		expect(play.failSeconds).toBeGreaterThan(0);
		expect(play.pp).toBe(0);
		expect(total(play.xp)).toBe(0);
	});

	it('earns nothing with unranked mods', () => {
		const play = simulateState({
			checksum: checksumOf(hard), state: at(0), rate: 1, mods: ['NF'],
		}, hard);
		expect(play.passed).toBe(true);
		expect(play.pp).toBe(0);
		expect(total(play.xp)).toBe(0);
	});
});

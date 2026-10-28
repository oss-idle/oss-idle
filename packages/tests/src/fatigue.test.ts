import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	afterPlay,
	type Fatigue,
	fatigueLevel,
	restedFatigue,
	warmup,
	warmupBar,
	warmupTrend,
} from '@oss-idle/shared/fatigue';
import Reading from '@oss-idle/shared/rulesets/mania/4k/skills/reading';
import Speed from '@oss-idle/shared/rulesets/mania/4k/skills/speed';
import { tireSkill } from '@oss-idle/shared/rulesets/mania/4k/tiring';
import { xpToLevel } from '@oss-idle/shared/xp';

const MAP = 3;
const GAP = 0.5;

/** Plays 3-minute maps back to back (30s apart), each strained this share of its length. */
const session = (shares: number[], from?: Fatigue) => {
	let fatigue = from;
	let now = from?.at ?? 0;
	for (const share of shares) {
		now += (GAP + MAP) * 60_000;
		fatigue = afterPlay(fatigue, MAP, share * MAP, now);
	}
	return fatigue!;
};
const level = (fatigue: Fatigue) => fatigueLevel(restedFatigue(fatigue, fatigue.at));
const loop = (share: number, hours: number) =>
	Array(Math.round(hours * 60 / (GAP + MAP))).fill(share);

describe('fatigue', () => {
	it('rests a minute per idle minute', () => {
		const tired = {
			at: 0, minutes: 7 * 60, 
		};
		expect(restedFatigue(tired, 3 * 3_600_000)).toBeCloseTo(4 * 60);
	});

	it('rests a play strained up to 20% like waiting and adds 3x a fully strained one', () => {
		const tired = session(loop(1, 1));
		const end = tired.at + MAP * 60_000;
		for (const share of [0, 0.1, 0.2]) {
			expect(afterPlay(tired, MAP, share * MAP, end).minutes).toBeCloseTo(restedFatigue(tired, end));
		}
		expect(afterPlay(tired, MAP, 0.25 * MAP, end).minutes).toBeGreaterThan(restedFatigue(tired, end));
		expect(afterPlay(tired, MAP, MAP, end).minutes).toBeCloseTo(tired.minutes + 3 * MAP);
	});

	it('tires more with each share of strain past 20%', () => {
		const tired = session(loop(1, 1));
		const after = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1].map(share => session([share], tired).minutes);
		expect(after.every((m, i) => i === 0 || m > after[i - 1])).toBe(true);
	});

	it('rests a fully strained map off with 3 easy ones', () => {
		const strained = session([1], session(loop(1, 1)));
		expect(session([0, 0], strained).minutes).toBeGreaterThan(strained.minutes - 3 * MAP);
		expect(session([0, 0, 0], strained).minutes).toBeLessThanOrEqual(strained.minutes - 3 * MAP);
	});

	it('kicks in at 5 hours of fatigue and floors at 7', () => {
		expect(fatigueLevel(5 * 60)).toBe(0);
		expect(fatigueLevel(5.5 * 60)).toBeGreaterThan(0);
		expect(fatigueLevel(6 * 60)).toBeCloseTo(0.5);
		expect(fatigueLevel(7 * 60)).toBe(1);
		expect(level(session(loop(1, 2)))).toBe(0);
		expect(level(session(loop(1, 4)))).toBe(1);
	});

	it('tires a loop of normal maps much slower', () => {
		expect(level(session(loop(0.4, 6)))).toBeLessThan(0.05);
		expect(level(session(loop(0.25, 24)))).toBe(0);
	});

	it('plays an exhausted physical skill at the level a quarter of its xp reaches', () => {
		const speed = new Speed(80);
		speed.xp.set(500);
		tireSkill(speed, 1);
		expect(speed.level.get()).toBeLessThan(80);
		expect(xpToLevel(speed.level.get()) + speed.xp.get()).toBeCloseTo((xpToLevel(80) + 500) / 4);

		const reading = new Reading(80);
		tireSkill(reading, 1);
		expect(reading.level.get()).toBe(80);
	});

	it('warms up over 1h30 of strain, then cools to half at 5 hours and cold at 6', () => {
		expect(warmup(0)).toBe(0);
		expect(warmup(59)).toBeLessThan(1);
		expect(warmup(60)).toBe(1);
		expect(warmup(90)).toBe(1);
		expect(warmup(300)).toBe(0.5);
		expect(warmup(360)).toBe(0);
		expect(warmup(420)).toBe(0);
	});

	it('warms faster and holds the peak 30 minutes longer with 10 stamina gear', () => {
		expect(warmup(15, 10)).toBe(1);
		expect(warmup(45, 10)).toBe(1);
		expect(warmup(120, 10)).toBe(1);
		expect(warmup(121, 10)).toBeLessThan(1);
		expect(warmup(330, 10)).toBe(0.5);
		expect(warmup(390, 10)).toBe(0);
	});

	it('puts the warm-up bar\'s sweet spot around the peak and fatigue at the right end', () => {
		for (const gear of [0, 10, 20]) {
			const bar = [...Array(421).keys()].map(m => warmupBar(m, gear));
			expect(bar.every((v, m) => m === 0 || v >= bar[m - 1])).toBe(true);
			expect(bar[0]).toBe(0);
			expect(bar[420]).toBe(1);
			bar.forEach((v, m) => {
				if (v > 0.4 && v < 0.6) expect(warmup(m, gear)).toBeGreaterThan(0.9);
				if (v > 0.8) expect(fatigueLevel(m)).toBeGreaterThan(0);
			});
		}
		expect(warmupBar(90)).toBeGreaterThan(0.4);
		expect(warmupBar(90)).toBeLessThan(0.6);
		expect(warmupBar(300)).toBeCloseTo(0.8);
	});

	it('adds less with each gear tier past the ladder, cold by the strain cap', () => {
		const peak = (gear: number) => [...Array(421).keys()].filter(m => warmup(m, gear) === 1).length;
		const gains = [10, 11, 12, 13].map(g => peak(g + 1) - peak(g));
		expect(gains[0]).toBeGreaterThan(gains[1]);
		expect(gains[1]).toBeGreaterThan(gains[2]);
		for (const gear of [0, 10, 20, 1000]) {
			expect(warmup(7 * 60, gear)).toBe(0);
			expect([...Array(421).keys()].every(m => Number.isFinite(warmup(m, gear)))).toBe(true);
		}
	});

	it('stops counting strain at 7 hours', () => {
		expect(session(loop(1, 24)).minutes).toBe(7 * 60);
	});

	it('plays a cold physical skill at half its xp from level 100, less below', () => {
		const cold = (level: number) => {
			const speed = new Speed(level);
			tireSkill(speed, 0, 0);
			return xpToLevel(speed.level.get()) + speed.xp.get();
		};
		expect(cold(0)).toBe(0);
		expect(cold(50)).toBeCloseTo(xpToLevel(50) * 0.75);
		expect(cold(100)).toBeCloseTo(xpToLevel(100) / 2);
		expect(cold(120)).toBeCloseTo(xpToLevel(120) / 2);

		const warm = new Speed(80);
		tireSkill(warm, 0, 1);
		expect(warm.level.get()).toBe(80);
	});
});

describe('warmupTrend', () => {
	it('points right for strained maps, left for easy ones, harder for more', () => {
		expect(warmupTrend(MAP, MAP)).toBe(3);
		expect(warmupTrend(MAP, 0)).toBe(-3);
		expect(warmupTrend(MAP, MAP * 0.6)).toBe(1);
		expect(warmupTrend(MAP, MAP * 0.4)).toBe(-2);
		expect(warmupTrend(MAP, MAP * 0.2)).toBe(-3);
		expect(warmupTrend(0, 0)).toBe(0);
	});
});

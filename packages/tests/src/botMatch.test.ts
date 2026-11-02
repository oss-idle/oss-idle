import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	BOT_GRAPH_SIZE,
	BOT_MATCH_SKILLS,
	botGraph,
	botLiveLevels,
	type BotMatchLive,
	botOverall,
	levelColour,
} from '@oss-idle/shared/botMatch';
import { xpToLevel } from '@oss-idle/shared/xp';

import {
	accuracyFromTiming,
	accuracyOf,
	type BotMatchLevels,
	CEILING,
	type Counts,
	fitBot,
	type FitProgress,
	type Played,
	type Target,
} from '../../server/src/botMatch';
import { liveMatch } from '../../server/src/botMatchLive';

const SKILLS = ['aim', 'hands', 'calm'];
const NOTES = 1000;

/** A stand-in player: each map asks something of one skill, and misses what it can't reach. */
const playedAt = (share: number): Counts => {
	const marvelous = Math.round(NOTES * 0.6 * share);
	const perfect = Math.round(NOTES * 0.4 * share);
	return {
		MARVELOUS: marvelous, PERFECT: perfect, GREAT: 0, GOOD: 0, BAD: 0, MISS: NOTES - marvelous - perfect,
	};
};

type Map = Target & { skill: string };

const shareOf = (level: number) => Math.min(1, 0.5 + level / 200);

const fakePlay = async (levels: BotMatchLevels, target: Target): Promise<Played> =>
	playedAt(shareOf(levels[(target as Map).skill]!));

const mapOf = (skill: string, level: number): Map => ({
	skill, counts: playedAt(shareOf(level)),
});

const mapsFor = (real: Record<string, number>): Map[] => Object.entries(real)
	.flatMap(([skill, level]) => Array.from({ length: 6 }, () => mapOf(skill, level)));

describe('fitBot', () => {
	it('finds each skill the scores ask for', async () => {
		const real = {
			aim: 90, hands: 95, calm: 100,
		};
		const { levels } = await fitBot(SKILLS, mapsFor(real), fakePlay);
		for (const skill of SKILLS) {
			expect(Math.abs(levels[skill]! - real[skill as keyof typeof real])).toBeLessThan(2);
		}
	});

	it('goes by the best score: weak ones lower nothing', async () => {
		const strong = [mapOf('aim', 100), mapOf('hands', 100), mapOf('calm', 100)];
		const weak = SKILLS.flatMap(skill => Array.from({ length: 20 }, () => mapOf(skill, 20)));
		const { levels } = await fitBot(SKILLS, [...weak, ...strong], fakePlay);
		for (const skill of SKILLS) expect(levels[skill]).toBeGreaterThan(98);
	});

	it('lifts nothing for a fail on a map it plays well enough, and counts no reach', async () => {
		const fit = await fitBot(['aim'], [mapOf('aim', 20)], async (levels, target) => ({
			...await fakePlay(levels, target), failed: levels.aim! < CEILING,
		}));
		expect(fit.levels.aim).toBeLessThan(22);
		expect(fit.reached).toBe(0);
	});

	it('takes nothing less than a 1,000,000 for one', async () => {
		const pure = {
			...playedAt(1), MARVELOUS: NOTES, PERFECT: 0,
		};
		const fit = await fitBot(['aim'], [{ counts: pure }], async () => playedAt(1));
		expect(accuracyOf(playedAt(1))).toBe(1);
		expect(fit.reached).toBe(0);
		const pureFit = await fitBot(['aim'], [{ counts: pure }], async () => pure);
		expect(pureFit.reached).toBe(1);
	});

	it('leaves a score it can never reach out of the levels, and of what it reached', async () => {
		const maps = [...mapsFor({
			aim: 80, hands: 80, calm: 80,
		}), {
			skill: 'hands', counts: {
				...playedAt(1), MARVELOUS: 1, PERFECT: NOTES - 1,
			},
		}];
		const fit = await fitBot(SKILLS, maps, async (levels, target) => (target === maps.at(-1)
			? playedAt(0.5)
			: fakePlay(levels, target)));
		expect(fit.reached).toBe(maps.length - 1);
		expect(Math.abs(fit.levels.hands! - 80)).toBeLessThan(2);
		expect(fit.real.MARVELOUS)
			.toBe(maps.slice(0, -1).reduce((sum, map) => sum + map.counts.MARVELOUS, 0));
	});

	it('never goes past the ceiling', async () => {
		const { levels } = await fitBot(SKILLS, mapsFor({
			aim: 100, hands: 100, calm: 100,
		}), async () => playedAt(1));
		expect(Math.max(...Object.values(levels))).toBeLessThanOrEqual(CEILING);
	});

	it('retries a play that falls short before giving up on it', async () => {
		let plays = 0;
		const fit = await fitBot(['aim'], [mapOf('aim', 80)], async (levels, target) => {
			plays++;
			const played = await fakePlay(levels, target);
			return plays % 4 ? playedAt(0.5) : played;
		});
		expect(fit.reached).toBe(1);
	});
});

describe('fitBot, its best plays', () => {
	it('keeps its best clear on each map, reached or not, and nothing where it fails', async () => {
		const maps = [mapOf('aim', 50), mapOf('hands', 50)];
		let plays = 0;
		const { plays: best } = await fitBot(['aim', 'hands'], maps, async (levels, target) => ({
			...await fakePlay(levels, target),
			pp: ++plays,
			failed: target === maps[1] && levels.aim !== CEILING,
		}));
		expect(best.map(({ target }) => target)).toEqual([maps[0]]);
		expect(best[0]!.played.pp).toBeGreaterThan(0);
	});
});

describe('fitBot, a score past what it proves', () => {
	it('asks for 99.5% of a 100% to fit, and all of it to count as reached', async () => {
		const real = {
			...playedAt(1), MARVELOUS: 500, PERFECT: 500,
		};
		const fit = await fitBot(['aim'], [{ counts: real }], async () => ({
			MARVELOUS: 500, PERFECT: 496, GREAT: 4, GOOD: 0, BAD: 0, MISS: 0,
		}));
		expect(fit.levels.aim).toBeLessThan(1);
		expect(fit.reached).toBe(0);
	});

	it('plays a known level at the ceiling until the end', async () => {
		const seen: number[] = [];
		const fit = await fitBot(['aim'], [mapOf('aim', 50)], async (levels, target) => {
			seen.push(levels.timing!);
			return fakePlay(levels, target);
		}, () => {}, { timing: () => 80 });
		expect(fit.levels.timing).toBe(80);
		expect(seen[0]).toBe(CEILING);
		expect(seen.at(-1)).toBe(80);
	});
});

describe('accuracyFromTiming', () => {
	const scored = (ratio: number, stars: number, rate = 1, notes = 1000) => ({
		stars,
		rate,
		counts: {
			MARVELOUS: Math.round(notes * ratio / (ratio + 1)),
			PERFECT: notes - Math.round(notes * ratio / (ratio + 1)),
			GREAT: 0, GOOD: 0, BAD: 0, MISS: 0,
		},
	});
	const both = (easy: number, hard: number) => [scored(easy, 2), scored(hard, 6)];

	it('rises with each band: hard maps and easy maps both count', () => {
		const middle = accuracyFromTiming(both(40, 4));
		expect(accuracyFromTiming(both(40, 8))).toBeGreaterThan(middle);
		expect(accuracyFromTiming(both(80, 4))).toBeGreaterThan(middle);
	});

	it('goes by what the player is able to reach, not by a weak score', () => {
		const strong = Array.from({ length: 20 }, () => scored(40, 2));
		expect(accuracyFromTiming([...strong, scored(1, 2), scored(4, 6)]))
			.toBe(accuracyFromTiming([...strong, scored(4, 6)]));
	});

	it('leaves out rate mods and short maps', () => {
		const base = both(40, 4);
		expect(accuracyFromTiming([...base, scored(500, 6, 1.5), scored(500, 6, 1, 100)]))
			.toBe(accuracyFromTiming(base));
	});

	it('stays between nothing and the ceiling', () => {
		expect(accuracyFromTiming(both(1000, 1000))).toBeLessThanOrEqual(CEILING);
		expect(accuracyFromTiming([])).toBeGreaterThanOrEqual(0);
	});
});

describe('accuracyOf', () => {
	const counts = {
		MARVELOUS: 500, PERFECT: 400, GREAT: 100, GOOD: 0, BAD: 0, MISS: 0,
	};

	it('counts a MARVELOUS and a PERFECT as one', () => {
		expect(accuracyOf({
			...counts, MARVELOUS: 900, PERFECT: 0,
		})).toBe(accuracyOf(counts));
	});

	it('reads 100% whatever the PERFECTs', () => {
		expect(accuracyOf({
			...counts, PERFECT: 500, GREAT: 0,
		})).toBe(1);
	});

	it('goes by its own notes', () => {
		expect(accuracyOf({
			...counts, MARVELOUS: 450, PERFECT: 450, GREAT: 100,
		})).toBeCloseTo(accuracyOf({
			MARVELOUS: 1800, PERFECT: 1800, GREAT: 400, GOOD: 0, BAD: 0, MISS: 0,
		}), 10);
	});
});

describe('fitBot, while it runs', () => {
	it('climbs as each score arrives, all skills together, the known ones at the end', async () => {
		const heard: FitProgress[] = [];
		const maps = mapsFor({
			aim: 80, hands: 60,
		});
		const fromFirst: number[] = [];
		async function* arriving() {
			for (const map of maps) {
				yield map;
				fromFirst.push(heard.length);
			}
		}
		const fit = await fitBot(
			['aim', 'hands'],
			arriving(),
			fakePlay,
			progress => heard.push(structuredClone(progress)),
			{ timing: () => 80 },
		);
		expect(fromFirst[0]).toBeGreaterThan(0);
		const climbing = heard.filter(({ final }) => !final);
		expect(climbing.some(({ levels }) => levels.aim! > 0)).toBe(true);
		expect(climbing.some(({ levels }) => levels.hands! > 0)).toBe(true);
		for (const skill of ['aim', 'hands']) {
			const seen = climbing.map(({ levels }) => levels[skill]!);
			expect(seen).toEqual(seen.toSorted((a, b) => a - b));
		}
		expect(climbing.every(({ levels }) => levels.timing === undefined)).toBe(true);
		expect(heard.at(-1)!.levels.timing).toBe(80);
		expect(heard.at(-1)!.levels.aim).toBe(fit.levels.aim);
		expect(heard.at(-1)!.final).toEqual({
			done: maps.length, total: maps.length,
		});
	});

	it('finds the same levels whatever order the scores come in', async () => {
		const maps = [mapOf('aim', 30), mapOf('aim', 90), mapOf('aim', 60)];
		const { levels: mixed } = await fitBot(['aim'], maps, fakePlay);
		const { levels: hardest } = await fitBot(['aim'], [maps[1]!, maps[2]!, maps[0]!], fakePlay);
		expect(Math.abs(mixed.aim! - hardest.aim!)).toBeLessThan(1);
	});

	it('carries on from a first fit: levels never drop, its scores count at the end', async () => {
		const first = await fitBot(['aim'], [mapOf('aim', 70)], fakePlay);
		const earlier = [mapOf('aim', 70)];
		const fit = await fitBot(['aim'], [mapOf('aim', 30)], fakePlay, () => {}, {}, {
			levels: first.levels, targets: earlier,
		});
		expect(fit.levels.aim).toBe(first.levels.aim);
		expect(fit.reached).toBe(2);
		const higher = await fitBot(['aim'], [mapOf('aim', 90)], fakePlay, () => {}, {}, {
			levels: first.levels, targets: earlier,
		});
		expect(higher.levels.aim).toBeGreaterThan(88);
	});

	it('plays an easier score once a harder one has lifted the level', async () => {
		const maps = [mapOf('aim', 90), ...Array.from({ length: 50 }, () => mapOf('aim', 30))];
		let plays = 0;
		const { levels } = await fitBot(['aim'], maps, async (at, target) => {
			plays++;
			return fakePlay(at, target);
		});
		expect(levels.aim).toBeGreaterThan(88);
		expect(plays).toBeLessThan(400);
	});
});

describe('liveMatch', () => {
	const running = () => {
		const heard: BotMatchLive[] = [];
		let at = 0;
		const live = liveMatch(
			update => heard.push(update), ['best', 'history', 'rest', 'final'], () => at,
		);
		return {
			heard, live, pass: (seconds: number) => { at += seconds * 1000; },
		};
	};

	it('goes by a step\'s own pace once it has one', () => {
		const { heard, live, pass } = running();
		live.begin('rest', 10);
		pass(100);
		live.advance(5);
		expect(heard.at(-1)!.secondsLeft).toBeGreaterThan(99);
		pass(100);
		live.begin('final', 100);
		pass(10);
		live.advance(90);
		expect(heard.at(-1)!.secondsLeft).toBeLessThan(5);
	});

	it('counts the steps still to come', () => {
		const { heard, live } = running();
		live.begin('rest', 500);
		const reading = heard.at(-1)!.secondsLeft;
		live.begin('final', 500);
		expect(heard.at(-1)!.secondsLeft).toBeLessThan(reading);
		expect(heard.at(-1)!.secondsLeft).toBeGreaterThan(0);
	});

	it('tells about once a second, but always a new step', () => {
		const { heard, live, pass } = running();
		live.begin('best', 10);
		const before = heard.length;
		live.played();
		live.played();
		expect(heard.length).toBe(before);
		pass(2);
		live.played();
		expect(heard.at(-1)!.plays).toBe(3);
		live.begin('rest', 10);
		expect(heard.at(-1)!.step).toBe('rest');
	});
});

describe('botLiveLevels', () => {
	const [first, second, third] = BOT_MATCH_SKILLS;

	it('gives a skill not measured yet no level, not a guess', () => {
		const levels = botLiveLevels({
			levels: {
				[first!]: 100, [second!]: 80,
			},
		});
		expect(levels[first!]).toBe(100);
		expect(levels[third!]).toBe(0);
	});
});

describe('botOverall', () => {
	it('is what all the xp buys as one level', () => {
		expect(botOverall({ a: 100 })).toBeCloseTo(100, 5);
		expect(botOverall({
			a: 100, b: 100,
		})).toBeGreaterThan(100);
		const total = xpToLevel(50) + xpToLevel(50);
		expect(total).toBeGreaterThan(0);
		expect(botOverall({
			a: 50, b: 50,
		})).toBeLessThan(100);
	});
});

describe('botGraph', () => {
	const levels = Object.fromEntries(BOT_MATCH_SKILLS.map((skill, i) => [skill, 60 + i * 8]));
	const graph = botGraph(levels, skill => skill);

	it('keeps the names apart however low the levels are', () => {
		const radii = botGraph({}, skill => skill)
			.map(({ labelPath }) => Number(labelPath.split(/[MA ]/)[3]));
		expect(Math.min(...radii)).toBeGreaterThanOrEqual(178);
	});

	it('leaves out what real scores cannot show', () => {
		expect(BOT_MATCH_SKILLS).toHaveLength(7);
		for (const skill of ['memory', 'speedjam', 'consistency', 'concentration']) {
			expect(BOT_MATCH_SKILLS).not.toContain(skill);
		}
		expect(graph).toHaveLength(7);
	});

	it('keeps every name on the graph, even at the top level', () => {
		const top = Object.fromEntries(BOT_MATCH_SKILLS.map(skill => [skill, 130]));
		for (const { labelPath } of botGraph(top, skill => skill)) {
			const [, x0, y0, , , , , , x1, y1] = labelPath.split(/[MA ]/).map(Number);
			for (const x of [x0!, x1!]) expect(x).toBeGreaterThanOrEqual(0);
			for (const x of [x0!, x1!]) expect(x).toBeLessThanOrEqual(BOT_GRAPH_SIZE.width);
			for (const y of [y0!, y1!]) expect(y).toBeLessThanOrEqual(BOT_GRAPH_SIZE.height);
		}
	});

	it('runs names along the bottom left to right, not upside down', () => {
		const endsOf = (path: string) => {
			const parts = path.split(/[MA ]/).map(Number);
			return [parts[1]!, parts[8]!];
		};
		for (const [i, { labelPath, number }] of graph.entries()) {
			if (Math.abs(number.x - BOT_GRAPH_SIZE.cx) > Math.abs(number.y - BOT_GRAPH_SIZE.cy)) continue;
			const [start, end] = endsOf(labelPath);
			expect(start, `slice ${i}`).toBeLessThan(end!);
		}
	});

	it('writes each level just inside its own line', () => {
		for (const { number, arc, skill } of graph) {
			const [, startX, startY] = arc.split(/[MA ]/).map(Number);
			const fromMiddle = (x: number, y: number) =>
				Math.hypot(x - BOT_GRAPH_SIZE.cx, y - BOT_GRAPH_SIZE.cy);
			expect(fromMiddle(number.x, number.y), skill)
				.toBeLessThan(fromMiddle(startX!, startY!));
		}
	});

	it('colours levels from 100 up as the game does', () => {
		expect(levelColour(99)).toBeUndefined();
		expect(levelColour(100)).toBe('rgb(238, 198, 240)');
		expect(levelColour(125)).toBe(levelColour(110));
	});
});

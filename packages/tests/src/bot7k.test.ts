import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';
import {
	describe,
	expect,
	it,
} from 'vitest';

import Bot7k from '@oss-idle/shared/rulesets/mania/7k/bots/character';
import { Skills7k } from '@oss-idle/shared/rulesets/mania/7k/skills';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';

const x = (column: number) => Math.floor((column + 0.5) * 512 / 7);
const notes = Array.from({ length: 280 }, (_, i) => {
	const time = 1000 + i * 90;
	return i % 20 === 0
		? `${x(i % 7)},192,${time},128,0,${time + 700}:0:0:0:0:`
		: `${x(i % 7)},192,${time},1,0,0:0:0:0:`;
});
const CHART = `osu file format v14

[General]
Mode: 3

[Difficulty]
HPDrainRate:6
CircleSize:7
OverallDifficulty:8
ApproachRate:5
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,300,4,1,0,100,1,0

[HitObjects]
${notes.join('\n')}
`;

const playAt = (level: number) => {
	const chart = new BeatmapDecoder().decodeFromString(CHART);
	const bot = new Bot7k({
		progress: () => ({
			level, xp: 0, upgrades: 0, overdrive: 0, prestige: 0, lifetimeXp: 0,
		}),
		fatigue: 0,
		warm: 1,
		plays: 0,
	});
	const game = new ManiaGame(chart, bot, { rate: 1 });
	game.update(game.songEndMs + 1000);
	return {
		chart, bot, game, 
	};
};

describe('7K public bot', () => {
	it('plays better as its skills level up', () => {
		const accuracy = (level: number) => playAt(level).game.score.accuracy;
		expect(accuracy(100)).toBeGreaterThan(accuracy(0));
	});

	it('speaks 7K skills', () => {
		const { chart, bot, game } = playAt(50);
		const xp = bot.getSkillsXP(chart.totalLength, xpScore(chart, game, { rate: 1 }));
		expect(Object.keys(xp).sort()).toEqual([...Skills7k].sort());
		expect(xp.focus).toBeGreaterThan(0);
		expect(Object.keys(bot.strainsAt(5000))).toContain('jacks');
		expect(Object.keys(bot.strainsAt(5000))).not.toContain('jackspeed');
		expect(bot.strainedShare({ stamina: -1 })).toBeGreaterThan(0);
	});

	it('gains on 7K skills', () => {
		const { chart, bot, game } = playAt(10);
		const gains = bot.applyProgression(chart.totalLength, xpScore(chart, game, { rate: 1 }));
		expect(gains.map(g => g.skill)).toEqual([...Skills7k]);
	});
});

import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';
import {
	describe,
	expect,
	it,
} from 'vitest';

import { parseChart } from '@oss-idle/shared/rulesets/mania/editor/chart';
import { ScrollModel } from '@oss-idle/shared/rulesets/mania/scroll';

import ChartField from '@oss-idle/client/editor/chartField';

// Red lines past the 6-60000ms clamp, as SV mappers use them (polyriddim [brrrrrrrrrrrrrr vip]):
// a 1ms teleport, a stop, a BPM change normalized by a green line, a 6e-96ms red line, then 0 BPM
// past the parser's int limit (Cubibibibism [5908218]), with and without a near-zero green line.
const CHART = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,4,1,0,100,1,0
2000,5,4,1,0,100,1,0
2001,500,4,1,0,100,1,0
3000,60000000,4,1,0,100,1,0
3100,500,4,1,0,100,1,0
4000,250,4,1,0,100,1,0
4000,-200,4,1,0,100,0,0
5000,6E-96,4,1,0,100,1,0
5001,500,4,1,0,100,1,0
6000,100000000000,4,1,0,100,1,0
6500,500,4,1,0,100,1,0
6600,1.7976931348623158E+308,4,1,0,100,1,0
6600,-1E+41,4,1,0,100,0,0
6700,500,4,1,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
64,192,8000,1,0,0:0:0:0:
`;

describe('ScrollModel BPM lines', () => {
	const game = new ScrollModel(new BeatmapDecoder().decodeFromString(CHART));
	const chart = parseChart(CHART);
	const editor = new ChartField(chart, chart).scroll;
	const span = (s: ScrollModel, from: number, to: number) => s.positionAt(to) - s.positionAt(from);

	it('scrolls by the unclamped BPM', () => {
		expect(span(game, 2000, 2001)).toBeCloseTo(100, 6);
		expect(span(game, 3000, 3100)).toBeLessThan(0.001);
		expect(game.getSpeedAt(4500)).toBeCloseTo(1, 6);
		expect(span(game, 7000, 8000)).toBeCloseTo(1000, 3);
	});

	it('stops the scroll on 0 BPM lines past the parser limit', () => {
		expect(span(game, 6000, 6500)).toBeLessThan(0.001);
		expect(span(game, 6600, 6700)).toBeLessThan(0.001);
	});

	it('scrolls the same in the editor', () => {
		for (const t of [0, 1500, 2000, 2001, 3050, 3100, 4500, 5000, 5001, 6000, 6300, 6650, 7000]) {
			expect(editor.positionAt(t)).toBeCloseTo(game.positionAt(t), 3);
		}
	});
});

// Stops at different 0-BPM beat lengths covering most of the map, as Amethyst Aurora [Aspire]
// (5965315): clamped, they all read as 60000ms (1 BPM) and would make it the 1x.
const STOPS = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,4,1,0,100,1,0
1000,599469035.291444,4,1,0,100,1,0
3000,500,4,1,0,100,1,0
3100,594610359.186824,4,1,0,100,1,0
5100,500,4,1,0,100,1,0

[HitObjects]
64,192,6000,1,0,0:0:0:0:
`;

describe('the 1x BPM', () => {
	it('is the most common beat length unclamped, not the stops clamped one', () => {
		const scroll = new ScrollModel(new BeatmapDecoder().decodeFromString(STOPS));
		expect(scroll.baseBpm).toBeCloseTo(120, 3);
		expect(scroll.getSpeedAt(500)).toBeCloseTo(1, 6);
	});
});

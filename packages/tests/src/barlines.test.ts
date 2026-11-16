import { BeatmapDecoder } from 'osu-parsers';
import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	buildBarlines,
	ScrollModel,
} from '@oss-idle/shared/rulesets/mania/scroll';

// Red lines at 6e-96ms, as in ISOxo - Chamber [Dimensional Drift] (4965027).
const CHART = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,4,1,0,100,1,0
58409,6E-96,4,1,0,100,1,0
58609,500,4,1,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
`;

describe('buildBarlines', () => {
	it('steps gimmick red lines by the clamped beat length', () => {
		const beatmap = new BeatmapDecoder().decodeFromString(CHART);
		const lines = buildBarlines(beatmap, 60000, new ScrollModel(beatmap));
		// 200ms section at 4 * 6ms per measure
		expect(lines.filter(l => l.time >= 58409 && l.time < 58609)).toHaveLength(9);
	});
});

// Bar line art as Amethyst Aurora [Aspire] (5965315) draws it: red lines without the omit flag
// whose green line at the same time has it, and red lines less than a ms apart.
const ART = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,9999,1,0,100,1,8
1000,500,9999,1,0,100,1,0
1000,-50,4,1,0,100,0,8
2000,500,9999,1,0,100,1,0
2000.4,500,9999,1,0,100,1,0
2000.6,500,9999,1,0,100,1,8

[HitObjects]
64,192,5000,1,0,0:0:0:0:
`;

describe('bar line art', () => {
	it('draws a line for each red line by its own omit flag, however close the next one is', () => {
		const beatmap = new BeatmapDecoder().decodeFromString(ART);
		const lines = buildBarlines(beatmap, 6000, new ScrollModel(beatmap));
		expect(lines.map(l => l.time)).toEqual([1000, 2000, 2000.4]);
	});
});

import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';
import {
	describe,
	expect,
	it,
} from 'vitest';

import { Bot } from '@oss-idle/shared/rulesets/mania/bot';
import { parseChart } from '@oss-idle/shared/rulesets/mania/editor/chart';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';

import ChartField from '@oss-idle/client/editor/chartField';

class Autoplay extends Bot {
	pressOffset() {
		return 0;
	}
	releaseOffset() {
		return 0;
	}
}

// NaN-start holds as DarTokki - Speed Up! [Diff lvl [-?-]] draws with them, and a hold ending
// before it starts as Amethyst Aurora [Aspire] does: only their tail shows.
const CHART = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,4,1,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,NaN,128,0,1500:0:0:0:0:blank.wav
320,192,NaN,128,0,1200:0:0:0:0:blank.wav
448,192,NaN,1,0,0:0:0:0:
448,192,2000,128,0,2400:0:0:0:0:
64,192,9000,128,0,1700:0:0:0:0:
`;

describe('holds stable never plays', () => {
	const beatmap = new BeatmapDecoder().decodeFromString(CHART);
	const game = new ManiaGame(beatmap, new Autoplay(), { noFail: true });
	const chart = parseChart(CHART);
	const field = new ChartField(chart, chart);

	it('show as tails only, never played', () => {
		expect(game.notes.map(n => n.time)).toEqual([1000, 2000]);
		expect(game.tailOnly.map(t => [t.column, t.time])).toEqual([[2, 1200], [1, 1500], [0, 1700]]);
	});

	it('show the same in the editor', () => {
		expect(field.notes.map(n => n.time)).toEqual([1000, 2000]);
		expect(field.tailOnly).toEqual(game.tailOnly);
	});
});

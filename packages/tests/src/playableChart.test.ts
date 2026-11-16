import {
	describe,
	expect,
	it,
} from 'vitest';

import { playableChart } from '@oss-idle/shared/osu/playableChart';

import { starsAt } from '../../server/src/pp';

const head = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,500,4,1,0,100,1,0

[HitObjects]
`;
const x = (i: number) => 64 + 128 * (i % 4);
const notes = Array.from({ length: 64 }, (_, i) => `${x(i)},192,${1000 + i * 125},1,0,0:0:0:0:`);
// Amethyst Aurora [Aspire] stacks thousands of holds that end before they start at one time
const decorations = Array.from({ length: 2000 }, (_, i) =>
	`${x(i)},192,9000,128,0,${1000 + i}:0:0:0:0:`);

describe('playableChart', () => {
	it('leaves out the holds stable never plays, and nothing else', () => {
		const nan = '64,192,NaN,128,0,1500:0:0:0:0:';
		const hold = '192,192,3000,128,0,3400:0:0:0:0:';
		const text = head + [...notes, nan, hold, ...decorations].join('\n');
		const kept = playableChart(text).split('[HitObjects]\n')[1].split('\n');
		expect(kept).toEqual([...notes, hold]);
	});

	it('rates a map without its decorations', () => {
		const plain = head + notes.join('\n');
		expect(starsAt(head + [...notes, ...decorations].join('\n'))).toBeCloseTo(starsAt(plain), 6);
	});
});

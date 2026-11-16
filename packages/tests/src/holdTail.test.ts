import '@oss-idle/shared/osu/controlPointPatch';

import { BeatmapDecoder } from 'osu-parsers';
import {
	describe,
	expect,
	it,
} from 'vitest';

import { ScrollModel } from '@oss-idle/shared/rulesets/mania/scroll';

import {
	type Frame,
	holdTailY,
} from '@oss-idle/client/gameplay/render/frame';

// A hold whose head sits on a 0.1ms teleport (1e9x BPM, 5.25x SV), as Cubibibibism [MeMetaMorpHosiSis]
// builds its "floating point LN": its length is about 1.24e9px at 2.356px per unit.
const CHART = `osu file format v14

[General]
Mode: 3

[Difficulty]
CircleSize:4
OverallDifficulty:8

[TimingPoints]
0,324.324324324324,4,2,1,30,1,0
1000,3.24324324324324E-07,4,2,1,30,1,0
1000,-19.047619047619,4,2,1,30,0,0
1000.1,324.324324324324,4,2,1,30,1,0

[HitObjects]
64,192,1000,128,0,1324:0:0:0:0:
64,192,9000,1,0,0:0:0:0:
`;

describe('holdTailY', () => {
	const scroll = new ScrollModel(new BeatmapDecoder().decodeFromString(CHART));
	const note = {
		headPos: scroll.positionAt(1000), tailPos: scroll.positionAt(1324), 
	};
	const at = (now: number) => holdTailY({
		g: {
			lineY: 955, pxPerUnit: 2.356, 
		}, nowPos: scroll.positionAt(now),
	} as Frame, note);

	it('snaps a hold across a huge teleport to the float32 grid, as stable does', () => {
		const ys = [1010, 1050, 1100, 1150, 1200, 1250].map(at);
		for (const y of ys) expect(y % 128).toBe(0);
		expect(new Set(ys).size).toBeGreaterThan(1);
	});

	it('leaves an ordinary hold where it is', () => {
		const plain = {
			headPos: scroll.positionAt(2000), tailPos: scroll.positionAt(2300), 
		};
		const y = holdTailY({
			g: {
				lineY: 955, pxPerUnit: 2.356, 
			}, nowPos: scroll.positionAt(1900), 
		} as Frame, plain);
		expect(y).toBeCloseTo(955 - 400 * 2.356, 2);
	});
});

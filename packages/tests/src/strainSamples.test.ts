import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	type StrainSamples,
	strainsBetween,
} from '@oss-idle/shared/play';

import ServerStrains from '@oss-idle/client/gameplay/ServerStrains';

describe('strain samples streamed with the replay', () => {
	// 41 samples, 0 to 10 s; skill a climbs 0..40, b stays 50
	const all: StrainSamples = {
		from: 0,
		every: 250,
		skills: ['a', 'b'],
		values: Array.from({ length: 41 }, (_, k) => [k, 50]),
	};
	// note reveal times the chunks end on, as the replay stream cuts them
	const cuts = [-Infinity, 1100, 1100, 3900, 7250, Infinity];

	it('hands out every sample once over the chunks', () => {
		const chunks = cuts.slice(1).map((upTo, i) => strainsBetween(all, cuts[i], upTo));
		const values = chunks.flatMap(c => c?.values ?? []);
		expect(values).toEqual(all.values);
		expect(chunks[1]).toBeUndefined();
		expect(chunks[2]?.from).toBe(1250);
	});

	it('gives the gauges at a song time from the chunks received', () => {
		const strains = new ServerStrains();
		strains.add(strainsBetween(all, -Infinity, 1100));
		strains.add(strainsBetween(all, 1100, 3900));
		expect(strains.strainsAt(-100)).toEqual({
			a: 0, b: 0, 
		});
		expect(strains.strainsAt(1000)).toEqual({
			a: 0.04, b: 0.5, 
		});
		expect(strains.strainsAt(3800)).toEqual({
			a: 0.15, b: 0.5, 
		});
		// past what arrived, it holds the last sample
		expect(strains.strainsAt(9000)).toEqual({
			a: 0.15, b: 0.5, 
		});
	});
});

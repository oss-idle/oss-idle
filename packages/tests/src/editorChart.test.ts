import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	backgroundOf,
	emptyIn,
	fileIdsOf,
	multiplierOf,
	parseChart,
	scrollBeatLength,
	snapLines,
	snapTime,
	stepTime,
	withBackground,
	withFileIds,
	withSetMetadata,
	writeChart,
} from '@oss-idle/shared/rulesets/mania/editor/chart';

const OSU = [
	'osu file format v14',
	'',
	'[General]',
	'AudioFilename: audio.mp3',
	'PreviewTime: 0',
	'',
	'[Metadata]',
	'Title:Song',
	'Artist:Someone',
	'Creator:Mapper',
	'Version:Easy',
	'',
	'[Difficulty]',
	'CircleSize:4',
	'',
	'[TimingPoints]',
	'1000,500,4,2,0,40,1,0',
	'1500,-50,4,2,0,40,0,0',
	'',
	'[HitObjects]',
	'64,192,1000,1,0,0:0:0:0:',
	'448,192,1250,128,2,1750:0:0:0:0:kick.wav',
	'',
	'[Events]',
	'//kept',
	'',
].join('\r\n');

describe('editor chart', () => {
	it('reads columns, long notes, BPM points and metadata', () => {
		const chart = parseChart(OSU);
		expect(chart.keys).toBe(4);
		expect(chart.timing).toEqual([{
			time: 1000, beatLength: 500, meter: 4, sound: '2,0,40', effects: '0',
		}]);
		expect(chart.notes).toEqual([
			{
				time: 1000, column: 0, hitSound: '0', sample: '0:0:0:0:',
			},
			{
				time: 1250, column: 3, end: 1750, hitSound: '2', sample: '0:0:0:0:kick.wav',
			},
		]);
		expect(chart.metadata).toMatchObject({
			title: 'Song', artist: 'Someone', creator: 'Mapper', version: 'Easy', source: '', previewTime: 0,
		});
	});

	it('writes notes back and leaves the rest of the file alone', () => {
		const chart = parseChart(OSU);
		const text = writeChart(chart, chart);
		expect(parseChart(text).notes).toEqual(chart.notes);
		expect(text).toContain('\r\n[Events]\r\n//kept');
		expect(writeChart(chart, {
			...chart, notes: [{
				...chart.notes[0], column: 2, 
			}],
		})).toContain('320,192,1000,1,0,0:0:0:0:');
	});

	it('writes BPM points among the scroll speed ones, which stay as they were', () => {
		const chart = parseChart(OSU);
		const text = writeChart(chart, {
			...chart,
			timing: [...chart.timing, {
				...chart.timing[0], time: 2000, beatLength: 250, meter: 3, 
			}],
		});
		expect(text).toContain([
			'[TimingPoints]',
			'1000,500,4,2,0,40,1,0',
			'1500,-50,4,2,0,40,0,0',
			'2000,250,3,2,0,40,1,0',
		].join('\r\n'));
	});

	it('writes metadata in the file\'s own spacing, adding missing keys', () => {
		const chart = parseChart(OSU);
		const text = writeChart(chart, {
			...chart, metadata: {
				...chart.metadata, title: 'New', source: 'Game', previewTime: 1234, 
			},
		});
		expect(text).toContain('Title:New\r\n');
		expect(text).toContain('Tags:\r\n');
		expect(text).toContain('PreviewTime: 1234');
		expect(parseChart(text).metadata).toMatchObject({
			title: 'New', source: 'Game', version: 'Easy', 
		});
	});

	it('shares set-wide metadata with another difficulty but keeps its name', () => {
		const other = OSU.replace('Version:Easy', 'Version:Hard');
		const metadata = {
			...parseChart(OSU).metadata, artist: 'Band', 
		};
		expect(parseChart(withSetMetadata(other, metadata)).metadata)
			.toMatchObject({
				artist: 'Band', version: 'Hard', 
			});
	});

	it('reads SV points and writes them back, changed or not, among the BPM ones', () => {
		const chart = parseChart(OSU);
		expect(chart.scroll.map(multiplierOf)).toEqual([2]);
		const text = writeChart(chart, {
			...chart,
			scroll: [
				...chart.scroll,
				{
					...chart.scroll[0], time: 1000, beatLength: scrollBeatLength(0.5), 
				},
			],
		});
		expect(text).toContain([
			'[TimingPoints]',
			'1000,500,4,2,0,40,1,0',
			'1000,-200,4,2,0,40,0,0',
			'1500,-50,4,2,0,40,0,0',
		].join('\r\n'));
	});

	it('snaps and steps along the beat lines', () => {
		const { timing } = parseChart(OSU);
		expect(snapTime(timing, 1130, 4)).toBe(1125);
		expect(stepTime(timing, 1125, 4, 1)).toBe(1250);
		expect(stepTime(timing, 1130, 4, 1)).toBe(1250);
		expect(stepTime(timing, 1130, 4, -1)).toBe(1125);
		expect(stepTime(timing, 1000, 2, -1)).toBe(750);
	});

	it('labels each line with its smallest divisor', () => {
		const { timing } = parseChart(OSU);
		const lines = snapLines(timing, 1000, 1500, 4);
		expect(lines.map(l => l.denominator)).toEqual([1, 4, 2, 4]);
		expect(lines[0].measure).toBe(true);
	});

	it('reads and writes the ids a file carries, ignoring osu!\'s 0 and -1', () => {
		expect(fileIdsOf(OSU)).toEqual({
			setId: undefined, beatmapId: undefined, 
		});
		const stamped = withFileIds(OSU, {
			setId: 1000000007, beatmapId: 1000000012, 
		});
		expect(fileIdsOf(stamped)).toEqual({
			setId: 1000000007, beatmapId: 1000000012, 
		});
		expect(stamped).toContain('\r\nBeatmapSetID:1000000007\r\n');
		const again = withFileIds(stamped.replace('BeatmapID:1000000012', 'BeatmapID:-1'), {
			setId: 5, beatmapId: 6,
		});
		expect(fileIdsOf(again)).toEqual({
			setId: 5, beatmapId: 6, 
		});
		expect(again.match(/BeatmapID:/g)).toHaveLength(1);
		expect(fileIdsOf(OSU.replace('Version:Easy', 'Version:Easy\r\nBeatmapSetID:-1'))).toEqual({
			setId: undefined, beatmapId: undefined,
		});
	});

	it('reads and swaps the background image', () => {
		expect(backgroundOf(OSU)).toBeUndefined();
		const one = withBackground(OSU, 'bg.jpg');
		expect(backgroundOf(one)).toBe('bg.jpg');
		expect(one).toContain('[Events]\r\n0,0,"bg.jpg",0,0\r\n//kept');
		const two = withBackground(one, 'other.png');
		expect(backgroundOf(two)).toBe('other.png');
		expect(two.match(/^0,0,/gm)).toHaveLength(1);
	});

	it('moves an empty chart outside the ruleset into it, nothing else', () => {
		const template = OSU.replace('PreviewTime: 0', 'PreviewTime: 0\r\nMode: 0')
			.replace('CircleSize:4', 'CircleSize:5')
			.replace(/\[HitObjects\][^[]*/, '[HitObjects]\r\n\r\n');
		const sevenKey = emptyIn(template, 'mania7k');
		expect(sevenKey).toContain('Mode: 3\r\n');
		expect(parseChart(sevenKey).keys).toBe(7);
		expect(emptyIn(sevenKey, 'mania7k')).toBe(sevenKey);
		expect(parseChart(emptyIn(sevenKey, 'mania4k')).keys).toBe(4);
		expect(emptyIn(template, 'osu')).toBe(template);
		expect(emptyIn(sevenKey, 'osu')).toContain('Mode: 0\r\n');
		expect(emptyIn(OSU, 'mania7k')).toBe(OSU);
	});
});

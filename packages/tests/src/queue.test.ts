import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	applyQueueEdit,
	AUTOPILOT_MODE,
	nextStart,
	playsOnce,
	rotateQueue,
} from '@oss-idle/shared/queue';

const a = { beatmapId: 1 };
const b = { beatmapId: 2 };
const c = { beatmapId: 3 };

describe('server play queue', () => {
	it('sends the map that started to the back', () => {
		expect(rotateQueue([a, b, c], a)).toEqual([b, c, a]);
	});

	it('rotates the played map even when it is no longer the head', () => {
		expect(rotateQueue([b, a, c], a)).toEqual([b, c, a]);
	});

	it('drops the map that started when played once, but a LOOP still loops', () => {
		expect(rotateQueue([a, b], a, true)).toEqual([b]);
		expect(rotateQueue([b], b, true)).toEqual([]);
		expect(rotateQueue([{
			...a, repeat: 2,
		}, b], a, true)).toEqual([{
			...a, repeat: 2, played: 1,
		}, b]);
		expect(playsOnce(true, AUTOPILOT_MODE.LOOP)).toBe(false);
	});

	it('leaves the queue alone when the played map was removed meanwhile', () => {
		expect(rotateQueue([b, c], a)).toEqual([b, c]);
	});

	it('tells a locked rate apart from the same map at the character rate', () => {
		const fast = {
			beatmapId: 1, rate: 1.2,
		};
		expect(rotateQueue([a, fast, b], fast)).toEqual([a, b, fast]);
	});

	it('tells locked mods apart at the same locked rate', () => {
		const fast = {
			beatmapId: 1, rate: 1.2,
		};
		const hard = {
			...fast, mods: ['HR' as const],
		};
		expect(rotateQueue([hard, fast, b], fast)).toEqual([hard, b, fast]);
	});

	it('edits by entry, keeping the ones a device does not know', () => {
		expect(applyQueueEdit([a, b], {
			op: 'append', entry: c,
		})).toEqual([a, b, c]);
		expect(applyQueueEdit([a, b, c], {
			op: 'playNext', entry: c,
		})).toEqual([c, a, b]);
		expect(applyQueueEdit([a, b, c], {
			op: 'remove', entry: b,
		})).toEqual([a, c]);
		expect(applyQueueEdit([a, b, c], {
			op: 'move', entry: c, before: a,
		})).toEqual([c, a, b]);
		expect(applyQueueEdit([a, b, c], {
			op: 'move', entry: a,
		})).toEqual([b, c, a]);
		expect(applyQueueEdit([a, b], {
			op: 'move', entry: c, before: a,
		})).toEqual([a, b]);
		expect(applyQueueEdit([a, b], { op: 'clear' })).toEqual([]);
	});

	it('keeps a repeated map at its place until its run is done', () => {
		const twice = {
			beatmapId: 1, repeat: 2,
		};
		const once = rotateQueue([twice, b], twice);
		expect(once).toEqual([{
			...twice, played: 1,
		}, b]);
		expect(rotateQueue(once, twice)).toEqual([b, twice]);
	});

	it('edits the copy it names among duplicates', () => {
		expect(applyQueueEdit([a, b, a, c], {
			op: 'move', entry: {
				...a, nth: 1,
			}, before: b,
		})).toEqual([a, a, b, c]);
		expect(applyQueueEdit([a, b, a], {
			op: 'repeat', entry: {
				...a, nth: 1,
			}, repeat: 3,
		})).toEqual([a, b, {
			...a, repeat: 3,
		}]);
		expect(applyQueueEdit([a, b], {
			op: 'duplicate', entry: a,
		})).toEqual([a, a, b]);
		expect(applyQueueEdit([b, a, c, a], {
			op: 'playNext', entry: a,
		})).toEqual([a, b, c, a]);
	});

	it('schedules only an unpaused, non-empty, enabled queue', () => {
		const q = {
			paused: false, entries: [a],
		};
		expect(nextStart(q, AUTOPILOT_MODE.NEXT, 1000, 30)).toBe(1030);
		expect(nextStart({
			...q, paused: true,
		}, AUTOPILOT_MODE.NEXT, 1000, 30)).toBeUndefined();
		expect(nextStart({
			...q, entries: [],
		}, AUTOPILOT_MODE.NEXT, 1000, 30)).toBeUndefined();
		expect(nextStart(q, AUTOPILOT_MODE.DISABLED, 1000, 30)).toBeUndefined();
	});
});

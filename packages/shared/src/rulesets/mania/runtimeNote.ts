import type {
	HitObject,
	HitSample,
	IHasColumn,
	IHoldableObject,
} from 'osu-classes';

import type { NoteSound } from '../../sim/noteSounds.js';

export default class RuntimeNote {

	constructor(
		public time: number,
		public endTime: number,
		public column: number,
		public hold: boolean,
		public headJudged: boolean,
		public tailJudged: boolean,
		public holding: boolean,
		/** beat-snap divisor (1 = on-beat, 4 = 1/4, …; 0 = unsnapped) */
		public snap: number = 0,
		/** the sounds it plays when hit, resolved by the client to actual samples;
		 *  the sim never reads them */
		public sounds: NoteSound[] = [],
	) {}

	/** the map's own sample files among its sounds (keysounds) */
	get samples(): string[] {
		return this.sounds.flatMap(sound => ('file' in sound ? [sound.file] : []));
	}

	/** song time (ms) at which the tail resolved as a MISS (a dropped/fumbled
	 *  hold) - lets the renderer keep the remaining body on screen, dimmed,
	 *  instead of vanishing it the instant the tail is judged */
	public tailMissedAt?: number;

	/** signed press error (ms) recorded when this hold's head was caught;
	 *  `undefined` until then (and on a missed head). Combined with the release
	 *  error at the tail to form the long note's single judgement. */
	public headOffset?: number;

	/** a hold's tail beat-snap divisor, as `snap` */
	public endSnap = 0;

	/** scroll positions of the head and the tail (see {@link placeOn}) */
	public headPos = 0;
	public tailPos = 0;

	getEndTime(): number {
		return this.hold ? this.endTime : this.time;
	}

	/** Work out where the note sits on `scroll` once, so a frame drawing it only does
	 *  arithmetic (a lookup per note per frame is garbage the renderer stutters on). */
	placeOn(scroll: { positionAt(time: number): number }): void {
		this.headPos = scroll.positionAt(this.time);
		this.tailPos = scroll.positionAt(this.getEndTime());
	}

	getId(): string {
		return `${this.column}-${this.time}`;
	}

	public static fromHitObject(
		hitObject: HitObject | IHoldableObject | IHasColumn,
		snap: number,
		soundsOf: (samples: HitSample[], time: number) => NoteSound[] = () => [],
	): RuntimeNote {
		const time = 'startTime' in hitObject ? hitObject.startTime : 0;
		const sounds = 'samples' in hitObject ? soundsOf(hitObject.samples, time) : [];
		return new RuntimeNote(
			'startTime' in hitObject ? hitObject.startTime : 0,
			'endTime' in hitObject ? hitObject.endTime : 0,
			'column' in hitObject ? hitObject.column : 0,
			'endTime' in hitObject,
			false,
			false,
			false,
			snap,
			sounds,
		);
	}

}

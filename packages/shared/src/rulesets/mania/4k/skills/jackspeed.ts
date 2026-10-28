import cubic_bezier from '../../../../math/cubic_bezier.js';
import lerp from '../../../../math/lerp.js';
import { smoothNormalize } from '../../../../math/normalize.js';
import transpose from '../../../../math/transpose.js';
import type { BotContext } from '../../bot.js';
import type RuntimeNote from '../../runtimeNote.js';
import type {
	SkillStrain,
	Strain,
} from '../bots/character.js';
import { SKILL } from '../skills.js';
import Skill from './skill.js';
import {
	hand,
	manipChance,
} from './speed.js';

/** One hand's last press: the strain entry carrying the running late debt, the
 *  group anchor (chord/manip notes merge into a single press), and whether that
 *  press was a jump (two same-hand notes at once). */
type HandAction = { entry: SkillStrain, anchor: RuntimeNote, jump: boolean };

/** Chance per press in the nps..max band that it drifts late. */
const RECOVERY_CHANCE_MIN = 0.01;
const RECOVERY_CHANCE_MAX = 0.15;
const MAX_RECOVERY_CHANCE_MIN = 0.01;
const MAX_RECOVERY_CHANCE_MAX = 0.15;

/** Per-press drift at the top of the nps..max band, as a fraction of the
 *  hand's minimum press interval. */
const DRIFT_FACTOR = 0.5;

/** Repeated jump-jacks (two same-hand notes re-pressed onto a previous jump)
 *  strain nearly as much as a single-finger jack, not double - scale the jack
 *  strain and the late debt it carries down by this. */
const JUMP_JACK_STRAIN_FACTOR = 0.6;

/**
 * JackSpeed is how fast one hand can re-press. Same-hand notes are grouped
 * into presses (chords/manip merge, mirroring Speed's groups) and each hand is
 * strained independently on the gap between its own presses.
 *
 * Three caps, in presses per second per hand:
 *  - `comfort`: below it the hand is fresh - no strain at all.
 *  - `nps`: comfort..nps is hittable cleanly but dirties accuracy (unpure).
 *  - `max`: nps..max some presses drift late; past `max`
 *    the hand physically can't keep up - each press is delayed by the full
 *    deficit and the lateness compounds into `lateFloor`, a hard minimum on
 *    how early the press can land (enforced across all skills by the bot).
 */
export default class JackSpeed extends Skill {

	private static fn = cubic_bezier(.83,.63,.9,.71);

	private comfort!: number;
	private nps!: number;
	private max!: number;

	private recovery_min!: number;
	private recovery_max!: number;

	/** Per-play (keyed on the bot's map strain) last press of each finger. */
	private fingers = new WeakMap<Strain, Partial<Record<number, HandAction>>>();

	constructor(def = 0) {
		super(SKILL.jackspeed, def);

		this.syncSkillLevel(level => {
			const { base, comfort, nps, max } = JackSpeed.computeForLevel(level);
			this.comfort = comfort;
			this.nps = nps;
			this.max = max;

			this.recovery_min = transpose(base, [0, 1], [RECOVERY_CHANCE_MIN, RECOVERY_CHANCE_MAX]);
			this.recovery_max = transpose(base, [0, 1], [MAX_RECOVERY_CHANCE_MIN, MAX_RECOVERY_CHANCE_MAX]);
		});
	}

	public static computeForLevel(level: number) {
		const base = JackSpeed.fn(smoothNormalize(level, [0, 100], .25));
		const normal = JackSpeed.fn(smoothNormalize(level, [0, 50], .25));
		const late = JackSpeed.fn(smoothNormalize(level, [70, 100], .25));
		const verylate = JackSpeed.fn(smoothNormalize(level, [90, 100], .25));
		const bonus = JackSpeed.fn(smoothNormalize(level, [100, 200], .25));

		const comfort = 2 + 2 * base + 0.5 * normal + 0.65 * late + 1.75 * verylate + 8 * bonus;
		const nps = comfort + 1 + 2 * base;
		
		return {
			base,
			comfort,
			nps,
			max: nps + 1 + 2 * base,
		};
	}

	analyze(note: RuntimeNote, context: BotContext, mapStrain: Strain, colStrain: Strain): SkillStrain {
		const currentStrain: SkillStrain = {
			note,
			strain: 0,
			min: 0,
			max: 80,
			type: 0.8,
			unpure: 0,
		};

		// every note pushes exactly one jackspeed strain, so the series length is
		// this note's index into the time-sorted note list
		const jumping = this.isJump(note, context, mapStrain.jackspeed.length);

		const fingers = this.fingers.get(mapStrain) ?? {};
		this.fingers.set(mapStrain, fingers);

		const finger = note.column;
		const action = fingers[finger];
		const maxInterval = 1000 / this.max;

		if (action && Math.random() < manipChance(note.time - action.anchor.time)) {
			// merged into the previous press (chord/manip): the hand hits once, so
			// this note shares that press's timing debt instead of jacking on it
			currentStrain.strain = action.entry.strain;
			currentStrain.unpure = action.entry.unpure;
			currentStrain.bias = action.entry.bias;
			currentStrain.lateFloor = action.entry.lateFloor;
			currentStrain.type = action.entry.type;
		} else {
			// a jump re-pressed onto a previous jump shares the hand's load across
			// two fingers, so it strains less than the per-finger jack suggests
			this.jack(currentStrain, action, note, maxInterval, jumping && (action?.jump ?? false));
			fingers[finger] = {
				entry: currentStrain, anchor: note, jump: jumping, 
			};
		}

		colStrain.jackspeed.push(currentStrain);
		mapStrain.jackspeed.push(currentStrain);

		return currentStrain;
	}

	/** Is this note part of a jump - two (or more) notes on the same hand pressed
	 *  at the same time? Same-time notes are contiguous in the time-sorted list, so
	 *  scan both sides of `idx` while the time matches for a same-hand sibling. */
	private isJump(note: RuntimeNote, context: BotContext, idx: number): boolean {
		const notes = context.notes;
		const h = hand(note.column, context.keyCount);
		for (let j = idx - 1; j >= 0 && notes[j].time === note.time; j--) {
			if (notes[j].column !== note.column && hand(notes[j].column, context.keyCount) === h) return true;
		}
		for (let j = idx + 1; j < notes.length && notes[j].time === note.time; j++) {
			if (notes[j].column !== note.column && hand(notes[j].column, context.keyCount) === h) return true;
		}
		return false;
	}

	/** Strain this press as a jack on its finger: dirty accuracy in the comfort..nps
	 *  band, drift late in nps..max, and carry compounding late debt past max.
	 *  `jumpJack` (this press and the finger's previous press are both jumps) only
	 *  shaves the strain THIS press adds - the carried debt presses on in full, so
	 *  a jump-jack costs less to sustain without ever healing old lateness. */
	private jack(
		currentStrain: SkillStrain, 
		action: HandAction | undefined, 
		note: RuntimeNote, 
		maxInterval: number, 
		jumpJack: boolean,
	) {
		const previous = action?.entry;
		currentStrain.unpure = (previous?.unpure ?? 0) / 2;

		const gap = action ? note.time - action.anchor.time : Infinity;
		const relief = jumpJack ? JUMP_JACK_STRAIN_FACTOR : 1;

		// debt the hand already owed - never relieved, only drained by gap slack
		const carried = previous?.lateFloor ?? 0;
		const added = this.bandStrain(currentStrain, gap, carried, maxInterval, relief);

		const debt = Math.max(0, carried + added);
		if (debt > 0) {
			currentStrain.lateFloor = debt;
			currentStrain.bias = debt;
			currentStrain.type = 'both';
		}
	}

	/** Classify this press's speed into a strain band (clean / dirty / drift /
	 *  over-cap), writing its strain & unpure onto `currentStrain`, and return the
	 *  late debt it adds on top of `carried`. A jump-jack's `relief` shaves only the
	 *  new deficit this press introduces, never the carried debt or the gap slack
	 *  that drains it. */
	private bandStrain(
		currentStrain: SkillStrain, 
		gap: number, 
		carried: number, 
		maxInterval: number, 
		relief: number,
	): number {
		const speed = 1000 / gap;
		// new deficit this press adds (relieved); negative slack drains the carried
		// debt and is left untouched so relief never heals old lateness
		let added = maxInterval - gap;
		if (added > 0) added *= relief;

		if (speed <= this.comfort) {
			// fresh: nothing to do, unpure decays
		} else if (speed <= this.nps) {
			// hittable cleanly, but accuracy gets dirtied
			const t = (speed - this.comfort) / (this.nps - this.comfort);
			currentStrain.unpure = (currentStrain.unpure ?? 0) + lerp(0, 0.01, t);
		} else if (speed <= this.max) {
			// drifting: a press lands a bit late with the recovery chance
			const t = (speed - this.nps) / (this.max - this.nps);
			currentStrain.strain = lerp(0.1, 0.4, t) * relief;
			if (Math.random() <= this.recovery_min) {
				currentStrain.unpure = (currentStrain.unpure ?? 0) + lerp(0.01, 0.05, t);
				added += t * DRIFT_FACTOR * maxInterval * relief;
			}
		} else {
			// over the physical cap: the press is late by the full deficit
			// (carried + this press's added) and it compounds press over press
			currentStrain.unpure = (currentStrain.unpure ?? 0) + 0.075;
			currentStrain.strain = Math.min(1, (carried + added) / maxInterval);

			if (Math.random() <= this.recovery_max) {
				added = -carried;
			}
		}

		return added;
	}
}

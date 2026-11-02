import clamp from '../../../../math/clamp.js';
import cubic_bezier from '../../../../math/cubic_bezier.js';
import gaussian from '../../../../math/gaussian.js';
import normalize from '../../../../math/normalize.js';
import transpose from '../../../../math/transpose.js';
import type { Mod } from '../../../../mods.js';
import type { SkillGain } from '../../../../play.js';
import {
	Bot,
	type BotContext,
} from '../../bot.js';
import { JUDGEMENT } from '../../judgement.js';
import type RuntimeNote from '../../runtimeNote.js';
import type { HitWindows } from '../../scoring.js';
import { modXp } from '../modXp.js';
import { skillProfiler } from '../profiler.js';
import {
	PRESSURE_SKILLS,
	SKILL,
	type SkillName,
} from '../skills.js';
import type Skill from '../skills/skill.js';

// Strain: abstract amount of difficulty

export type NoteStrain = {
	skill: SkillName,
	note: RuntimeNote,
	strain: number,
	min: number,
	max: number,
	type: 'negative' | 'positive' | 'both' | number,
	miss?: boolean,
	centerFactor?: number,
	release?: number,
	/** speed-only: fatigue accumulated past the sigma cap. The sigma itself stays
	 *  in [0, 1]; this tracks how far over-capped the player is and drives the
	 *  probabilistic over-cap miss. */
	overflow?: number,
	/** signed offset (ms) added to the error centre - shifts the hit cloud
	 *  early/late rather than just widening it (used for directional drift) */
	bias?: number,
	/** jackspeed-only: minimum press lateness (ms) physically forced by the
	 *  hand's max re-press rate - the final press offset is clamped to at least
	 *  this, no matter which skill's offset wins */
	lateFloor?: number,
	/** coordination-only: present on LN heads. A later note's analysis writes
	 *  `at` (absolute song ms) when a coordination error fumbles the hold - the
	 *  LN is then released at that moment instead of near its tail. A nested
	 *  object so the late write survives the copy `analyzeContext` makes of
	 *  each skill result. */
	forcedRelease?: { at?: number },
	/** the level-constant resting part of the strain (the player's baseline
	 *  imprecision). The strain HUD reports only the excess above it - resting
	 *  at baseline is "doing fine", not stress. */
	baseline?: number,
	/** consistency-only: the pressure level (0..1) its choke roll saw on this
	 *  note - kept so the strain debug graph can plot it */
	pressure?: number,
	/** memory-only: fraction (0..1) of SpeedJam's press error this note's recall
	 *  removes. SpeedJam (analyzed right after) scales its error by (1 - this). */
	memoryReduction?: number,
	/** memory-only: the XP training weight for this note - a hump (peaking
	 *  mid-recall, zero on a fresh or mastered map) so memory levels while it is
	 *  being *learned*, not once it already works. SpeedJam multiplies it by the
	 *  jam strain into `memoryCredit`. */
	memoryTrain?: number,
	/** memory-only: how much memory XP this note credits (jam strain × training
	 *  weight), written back by SpeedJam. Summed in getSkillsXP. */
	memoryCredit?: number,
	/** Scale this number to decrease accuracy due to usage of other skills */
	unpure?: number,
};

export type SkillStrain = Omit<NoteStrain, 'skill'>;

/** The minimal score shape the XP factors read - accuracy in 0..1, MISS = the
 *  play's judged miss count (drives the consistency penalty). Both the shared
 *  `ScoreState` and the client/server score rows satisfy it. */
export type ScoreLike = { accuracy: number, MISS: number };

/** A skill's level/xp snapshot before and after a play's progression, for the result screen. */
/** A play's gain on one 4K skill. */
export type SkillProgress = Omit<SkillGain, 'skill'> & { skill: SkillName };

export type Strain = {
	jackspeed: SkillStrain[],
	accuracy: SkillStrain[],
	concentration: SkillStrain[],
	reading: SkillStrain[],
	consistency: SkillStrain[],
	speed: SkillStrain[],
	coordination: SkillStrain[],
	memory: SkillStrain[],
	stamina: SkillStrain[],
	release: SkillStrain[],
	speedjam: SkillStrain[],
};

export const newStrain = (): Strain => ({
	jackspeed: [],
	accuracy: [],
	concentration: [],
	reading: [],
	consistency: [],
	speed: [],
	coordination: [],
	stamina: [],
	memory: [],
	release: [],
	speedjam: [],
});

/** Turn a strain into a signed timing offset (ms). Shared with the strain debug view. */
export function computeStrainOffset(s: SkillStrain): number {
	if (s.miss) return Infinity;
	const gauss = gaussian(s.strain ?? 0, s.centerFactor);
	const error = (s.min * (gauss >=0 ? 1 : -1)) + gauss * s.max + (s.bias ?? 0);
	switch (s.type) {
		case 'both': return error;
		case 'negative': return -Math.abs(error);
		case 'positive': return +Math.abs(error);
	}

	return Math.abs(error) * (Math.random() >= s.type ? -1 : 1);
}

/** Turn a strain into a signed timing offset (ms). Shared with the strain debug view. */
export function computeReleaseStrainOffset(s: SkillStrain): number {
	if (s.miss) return Infinity;
	const gauss = gaussian(s.release ?? 0, s.centerFactor);
	const error = (s.min * (gauss >=0 ? 1 : -1)) + gauss * s.max + (s.bias ?? 0);
	switch (s.type) {
		case 'both': return error;
		case 'negative': return -Math.abs(error);
		case 'positive': return +Math.abs(error);
	}

	return Math.abs(error) * (Math.random() >= s.type ? -1 : 1);
}

export const generalBasedScoreFactor = (
	skillLevel: number, 
	score: ScoreLike,
) => {
	return transpose(score.accuracy, [
		transpose(skillLevel, [0, 100], [0.7, 0.95]),
		transpose(skillLevel, [0, 100], [0.9, 1.05]),
	], [0, 1.5]);
};

export const hardAccBasedScoreFactor = (
	skillLevel: number, 
	score: ScoreLike,
) => {
	return transpose(score.accuracy, [
		transpose(skillLevel, [0, 60], [0.7, 0.93]),
		transpose(skillLevel, [40, 100], [0.98, 1.02]),
	], [0, 1.5]);
};

export const accBasedScoreFactor = (skillLevel: number, score: ScoreLike) => {
	return transpose(score.accuracy, [
		transpose(skillLevel, [0, 50], [0.7, 0.95]),
		transpose(skillLevel, [30, 100], [1, 1.05]),
	], [0, 1.5]);
};

export const highAccBasedScoreFactor = (
	skillLevel: number,
	score: ScoreLike,
) => {
	return transpose(score.accuracy, [
		transpose(skillLevel, [0, 75], [0.7, 0.995]),
		transpose(skillLevel, [50, 100], [1, 1.005]),
	], [0, 1.5]);
};

export const speedBasedScoreFactor = (skillLevel: number, score: ScoreLike) => {
	return transpose(score.accuracy, [
		transpose(skillLevel, [10, 100], [0.7, 0.9]),
		transpose(skillLevel, [10, 100], [1, 0.96]),
	], [0, 1.5]);
};

export const levelFactorCB = cubic_bezier(0,.8,.4,1);
export const xpFactorForLevel = (skillLevel: number): number => {
	return 1 + ((1 - levelFactorCB(clamp(skillLevel / 40, 0, 1))) * 2);
};

export const xpFactorForScore = (
	skill: SkillName,
	skillLevel: number,
	score: ScoreLike,
): number => {
	switch(skill) {
		case SKILL.reading:
			return generalBasedScoreFactor(skillLevel, score);
		case SKILL.accuracy:
			return highAccBasedScoreFactor(skillLevel, score);
		case SKILL.concentration:
		case SKILL.release:
			return accBasedScoreFactor(skillLevel, score);
		case SKILL.memory:
		case SKILL.speedjam:
			return hardAccBasedScoreFactor(skillLevel, score);
		case SKILL.consistency:
		case SKILL.coordination:
		case SKILL.speed:
		case SKILL.stamina:
		case SKILL.jackspeed:
		default:
			return speedBasedScoreFactor(skillLevel, score);
	}
};

export const notesCB = cubic_bezier(.62, .16, .5, .83);
export const highDensityBasedNotesFactor = (
	skillLevel: number,
	notes: number,
) => {
	const normalized = normalize(notes, [
		transpose(skillLevel, [0, 70], [0, 400]),
		transpose(skillLevel, [20, 100], [800, 1800]),
	]);
	return notesCB(normalized);
};

export const mediumDensityBasedNotesFactor = (
	skillLevel: number,
	notes: number,
) => {
	const normalized = normalize(notes, [
		transpose(skillLevel, [0, 70], [0, 200]),
		transpose(skillLevel, [0, 100], [300, 1200]),
	]);
	return notesCB(normalized);
};

export const lowDensityBasedNotesFactor = (
	skillLevel: number, 
	notes: number,
) => {
	const normalized = normalize(notes, [
		transpose(skillLevel, [0, 70], [0, 20]),
		transpose(skillLevel, [0, 100], [50, 700]),
	]);
	return notesCB(normalized);
};

export const xpFactorForNotes = (
	skill: SkillName,
	skillLevel: number,
	notes: number,
): number => {
	switch(skill) {
		case SKILL.accuracy:
		case SKILL.concentration:
		case SKILL.release:
		case SKILL.stamina:
		case SKILL.coordination:
			return highDensityBasedNotesFactor(skillLevel, notes);
		case SKILL.speed:
		case SKILL.speedjam:
		case SKILL.consistency:
			return mediumDensityBasedNotesFactor(skillLevel, notes);
		default:
			return lowDensityBasedNotesFactor(skillLevel, notes);
	}
};

const LENGTH_START = 120000;
const LENGTH_END = 300000;
const LENGTH_FACTOR = 3;
export const lengthCB = cubic_bezier(.2,0,.75,.0);
export const xpFactorForLength = (length: number): number => {
	return 1 + 
	lengthCB(clamp((length - LENGTH_START) / (LENGTH_END - LENGTH_START), 0, 1) )
	* (LENGTH_FACTOR - 1);
};

/** Each miss in a play multiplies consistency's earned pressure notes down -
 *  chokes are rare by nature, so a handful of misses must bite hard for
 *  "clean" to mean anything. */
export const CONSISTENCY_MISS_PENALTY = 0.5;

export const factorXP = (
	skill: SkillName, 
	noteXP: number,
	level: number, 
	score: ScoreLike,
	notes: number, 
	nonAcc: number, 
	length: number,
): number => {
	const skillNotes = skill === SKILL.accuracy ?  notes : nonAcc;
	if (skillNotes === 0) return 0; // no notes credited to this skill - avoid 0/0 → NaN
	const factor =  xpFactorForLevel(level)
		* xpFactorForScore(skill, level, score)
		* xpFactorForNotes(skill, level, skillNotes)
		* xpFactorForLength(length)
	;
	return mapXP(noteXP / skillNotes * factor * 1000);
};

export const xpCB = cubic_bezier(.96,-1.09,.27,1.02);
export const mapXP = (noteXP: number): number => {
	return (noteXP + xpCB(normalize(noteXP, [0, 1000])) * noteXP);
};

export type Strains = [RuntimeNote, [NoteStrain, number, number][]];

export default class CharacterBot extends Bot {

	/**
	 * What each note has been possibly strained by
	 */
	private noteStrains = new Map<string, Strains>();

	/**
	 * Remember by what each note has been strained, so we can apply character progression based on struggles
	 */
	private noteStrained = new Map<string, NoteStrain | null>();

	/**
	 * Remember by what each note has been strained, so we can apply character progression based on struggles
	 */
	private releaseStrained = new Map<string, NoteStrain | null>();

	/**
	 * Per-column strains
	 */
	private columnStrains: Strain[] = [];

	/**
	 * Global strains
	 */
	private mapStrain = newStrain();

	/** the play's hit windows, from the context it analyzes */
	private windows?: HitWindows;

	constructor(protected skills: Skill[]) {
		super();
	}

	generateEvents(context: BotContext) {
		this.analyzeContext(context);
		return super.generateEvents(context);
	}

	analyzeContext(context: BotContext) {
		this.columnStrains = [];
		this.windows = context.windows;

		for(const note of context.notes) {
			const arr: [NoteStrain, number, number][] = [];
			this.noteStrains.set(note.getId(), [note, arr]);
			const strain = this.columnStrains[note.column] ??= newStrain();

			for(const skill of this.skills) {
				// per-skill timing is off in production - just a boolean check here
				const t0 = skillProfiler.enabled ? performance.now() : 0;
				const result = {
					...skill.analyze(
						note, 
						context, 
						this.mapStrain, 
						strain,
					), 
					skill: skill.name, 
				};
				if (skillProfiler.enabled) 
					skillProfiler.add(skill.name, performance.now() - t0);
				arr.push([
					result, 
					computeStrainOffset(result), 
					computeReleaseStrainOffset(result),
				]);
			}
		}
	}

	pressOffset(note: RuntimeNote) {
		const strains = this.noteStrains.get(note.getId());
		if (!strains || !strains.length) return 0;

		const { offset, xpStrain } = this.resolveOffset(strains[1], 1);
		this.noteStrained.set(note.getId(), xpStrain);
		return offset;
	}

	releaseOffset(note: RuntimeNote) {
		const strains = this.noteStrains.get(note.getId());
		if (!strains || !strains.length) return 0;

		const { offset, xpStrain } = this.resolveOffset(strains[1], 2);
		this.releaseStrained.set(note.getId(), xpStrain);
		return offset;
	}

	/**
	 * Combine the per-skill strain offsets into the final timing error. `i` selects
	 * the press (1) or release (2) offset slot in each entry.
	 *
	 * The accuracy skill sets the baseline hit cloud. On top of it, the
	 * stamina-intensive skills (speed, stamina, jackspeed) *compound their fatigue
	 * onto that baseline*: when they show strain their error adds to accuracy's
	 * (and a strain-miss drops the note), so being pushed past comfort degrades the
	 * baseline rather than merely competing with it 50/50. When fresh they add
	 * nothing. The remaining "technique" skills keep the worst-vs-accuracy pick.
	 */
	private resolveOffset(entries: [NoteStrain, number, number][], i: 1 | 2): { 
		offset: number, 
		strain: NoteStrain,
		xpStrain: NoteStrain | null
	} {
		const acc = entries.find(r => r[0].skill === 'accuracy')!;

		// one pass over the per-skill entries; a forced outcome (fumbled hold / miss)
		// short-circuits to its final result, otherwise we fold the accumulators below
		const scan = this.scanEntries(entries, i, acc);
		if (scan.done) return scan.result;
		const { pureness, maxUnpure, lateFloor, floorStrain } = scan;

		let xpStrain: NoteStrain | null = scan.worst[0];
		const worst = i === 1 && Math.random() > 0.5 ? acc : scan.worst;
		let offset = worst[i];

		if (i === 1 && pureness < 1 && worst === acc) {
			acc[0].strain += 2 * (1 - Math.max(0, pureness));
			const affected = computeStrainOffset(acc[0]);
			if (Math.abs(affected) > Math.abs(offset)) {
				offset = affected;

				if (Math.abs(offset) > this.windows![JUDGEMENT.PERFECT]) {
					xpStrain = maxUnpure;
				} else if (Math.abs(offset) > this.windows![JUDGEMENT.MARVELOUS]) {
					xpStrain = null;
				}
			}
		}

		// Physical floor: the hand carries late debt (it cannot re-press faster
		// than jackspeed's max), so no skill's offset can land the press earlier.
		if (i === 1 && floorStrain && offset < lateFloor) {
			offset = lateFloor;
			xpStrain = floorStrain;
		}

		return {
			offset, strain: worst[0], xpStrain, 
		};
	}

	/**
	 * Single pass over the per-skill entries for {@link resolveOffset}. Returns a
	 * finished result the moment a skill forces the outcome - a fumbled-hold release
	 * (only on the release slot, `i === 2`) or a strain-miss that drops the note -
	 * otherwise the folded accumulators: the worst-vs-accuracy offset pick, the
	 * remaining purity budget, the most-impure skill, and the latest physical floor.
	 */
	private scanEntries(
		entries: [NoteStrain, number, number][], i: 1 | 2, acc: [NoteStrain, number, number],
	): { 
		done: true, 
		result: { 
			offset: number, 
			strain: NoteStrain, 
			xpStrain: NoteStrain | null
		} } | { 
			done: false, 
			worst: [NoteStrain, number, number],
			pureness: number,
			maxUnpure: NoteStrain, 
			lateFloor: number,
			floorStrain?: NoteStrain
		} {
		let pureness = 1;
		let worst = acc;
		let maxUnpure = acc[0];
		let lateFloor = 0;
		let floorStrain: NoteStrain | undefined;
		for (const r of entries) {
			const strain = r[0];
			// a coordination error fumbled this hold: it is released at the erroring
			// press's moment, overriding whatever tail offset the skills computed
			if (i === 2 && strain.forcedRelease?.at !== undefined) {
				return { 
					done: true, 
					result: { 
						offset: strain.forcedRelease.at - strain.note.getEndTime(),
						strain,
						xpStrain: strain,
					}, 
				};
			}
			pureness -= strain.unpure ?? 0;
			if ((strain.unpure ?? 0) > (maxUnpure.unpure ?? 0)) {
				maxUnpure = strain;
			}
			if ((strain.lateFloor ?? 0) > lateFloor) {
				lateFloor = strain.lateFloor!;
				floorStrain = strain;
			}
			if (strain.miss) return { 
				done: true, 
				result: { 
					offset: r[i], 
					strain, 
					xpStrain: r[0], 
				},
			};
			if (Math.abs(r[i]) > Math.abs(worst[i])) {
				worst = r;
			}
		}
		return {
			done: false, worst, pureness, maxUnpure, lateFloor, floorStrain, 
		};
	}

	/**
	 * Per-skill strain at song time `t` - the value carried by the last analyzed
	 * note at or before `t` - clamped to [0, 1] for gauge display (the strain HUD).
	 * Skills that strain the release rather than the press report that instead.
	 */
	strainsAt(t: number): Record<SkillName, number> {
		const out = {} as Record<SkillName, number>;
		for (const name of Object.keys(this.mapStrain) as SkillName[]) {
			const series = this.mapStrain[name];
			// last entry whose note starts at or before `t` (series is in note-time order)
			let lo = 0;
			let hi = series.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (series[mid].note.time <= t) lo = mid + 1;
				else hi = mid;
			}
			const s = lo > 0 ? series[lo - 1] : undefined;
			const raw = s ? Math.min(1, Math.max(0, s.strain, s.release ?? 0)) : 0;
			// gauge the stress relative to the skill's resting baseline, rescaled
			// so the full bar still spans baseline → max
			const base = Math.min(s?.baseline ?? 0, 0.99);
			out[name] = Math.max(0, (raw - base) / (1 - base));
		}
		return out;
	}

	private xp?: Record<SkillName, number>;
	getSkillsXP(
		length: number, 
		score: ScoreLike, 
	): Record<SkillName, number> {
		if (this.xp) return this.xp;

		this.xp = this.skills.reduce((skills, skill) => {
			skills[skill.name] = 0;
			return skills;
		}, {} as Record<SkillName, number>);

		const strained = [
			...this.noteStrained.entries(), 
			...this.releaseStrained.entries(),
		];
		const notes = strained.length;
		let nonAcc = 0;
		let pressure = 0;

		for (const [, strain] of strained) {
			if (strain !== null) {
				this.xp[strain.skill]++;
				if (PRESSURE_SKILLS.has(strain.skill)) pressure++;
			}
			if (strain?.skill !== SKILL.accuracy) nonAcc++;
		}

		// Consistency earns at play level, not from its own (rare, choke-only)
		// strained notes: pressure survived cleanly. Every judged miss in the
		// final score damps it (a chokey play trains little); accuracy chokes
		// damp it through the score factor. The result then flows through the
		// same factorXP pipeline as every other skill, keeping the progression
		// curve coherent.
		this.xp[SKILL.consistency] = pressure 
		* Math.pow(CONSISTENCY_MISS_PENALTY, score.MISS ?? 0) 
		* 0.33;

		// Memory also earns at play level: it is never a blamed skill (its press
		// strain is zero), so its only credit is the SpeedJam error it shaved off
		// across the map. SpeedJam loses that XP organically - its reduced errors
		// get it blamed on fewer notes. The sum flows through factorXP like any skill.
		this.xp[SKILL.memory] = this.mapStrain.memory.reduce((sum, m) => 
			sum + (m.memoryCredit ?? 0)
		, 0);

		for (const skill of this.skills) {
			const level = skill.level.get();
			this.xp[skill.name] = Math.floor(
				skill.xpMultiplier()
				* factorXP(skill.name, this.xp[skill.name], level, score, notes, nonAcc, length),
			);
		}

		return this.xp;
	}

	/** The share of the play's notes on which any skill in `thresholds` strained past its threshold. */
	strainedShare(thresholds: Partial<Record<SkillName, number>>): number {
		const strained = new Set<RuntimeNote>();
		for (const [skill, threshold] of Object.entries(thresholds) as [SkillName, number][]) {
			for (const s of this.mapStrain[skill]) {
				if (Math.max(s.strain, s.release ?? 0) > threshold) strained.add(s.note);
			}
		}
		return this.noteStrains.size ? strained.size / this.noteStrains.size : 0;
	}

	private progression?: SkillProgress[];
	applyProgression(
		length: number,
		score: ScoreLike,
		/** debug xp scaling for local plays; the server scales its own */
		xpMultiplier: number = 1,
		mods: readonly Mod[] = [],
		/** each skill's own scaling */
		perSkill: Readonly<Record<string, number>> = {},
	): SkillProgress[] {
		if (this.progression) return this.progression;

		const xp = modXp(this.getSkillsXP(length, score), mods);
		for (const name of Object.keys(xp) as SkillName[]) {
			const factor = Math.max(1, xpMultiplier) * (perSkill[name] ?? 1);
			if (factor !== 1) xp[name] = Math.floor(xp[name] * factor);
		}
		this.progression = this.skills.map((skill) => {
			const gained = xp[skill.name];
			const fromLevel = skill.level.get();
			const fromXp = skill.xp.get();
			const levels = skill.gainXP(gained);
			return {
				skill: skill.name,
				gained,
				fromLevel,
				fromXp,
				toLevel: skill.level.get(),
				toXp: skill.xp.get(),
				levels,
			};
		});

		return this.progression;
	}
}

import {
	GRADE,
	type Grade,
} from '../../grade.js';
import clamp from '../../math/clamp.js';
import {
	JUDGEMENT,
	type Judgement,
} from './judgement.js';
import { failsOn } from './mods.js';

/** What a divine adds on top of a marvelous, and only on a play that stayed
 *  pure - see ScoreState.accuracy. A full-divine play reads exactly 101%. */
export const DIVINE_ACCURACY_BONUS = 0.01;

/** The most accuracy a play can report: every note divine on a pure play. Wire
 *  schemas validate against this - a score above their ceiling is discarded on
 *  arrival, which surfaces as a play that never finishes. */
export const MAX_ACCURACY = 1 + DIVINE_ACCURACY_BONUS;

export const ACCURACY: {[key in Judgement]: number} = {
	[JUDGEMENT.DIVINE]: 1,
	[JUDGEMENT.MARVELOUS]: 1,
	[JUDGEMENT.PERFECT]: 1,
	[JUDGEMENT.GREAT]: 0.66,
	[JUDGEMENT.GOOD]: 0.33,
	[JUDGEMENT.BAD]: 0.16,
	[JUDGEMENT.MISS]: 0,
};

const HIT_VALUE: {[key in Judgement]: number} = {
	[JUDGEMENT.DIVINE]: 320,
	[JUDGEMENT.MARVELOUS]: 320,
	[JUDGEMENT.PERFECT]: 300,
	[JUDGEMENT.GREAT]: 200,
	[JUDGEMENT.GOOD]: 100,
	[JUDGEMENT.BAD]: 50,
	[JUDGEMENT.MISS]: 0,
};

const BONUS_VALUE: {[key in Judgement]: number} = {
	[JUDGEMENT.DIVINE]: 32,
	[JUDGEMENT.MARVELOUS]: 32,
	[JUDGEMENT.PERFECT]: 32,
	[JUDGEMENT.GREAT]: 16,
	[JUDGEMENT.GOOD]: 8,
	[JUDGEMENT.BAD]: 4,
	[JUDGEMENT.MISS]: 0,
};

const HIT_BONUS: {[key in Judgement]: number} = {
	[JUDGEMENT.DIVINE]: 2,
	[JUDGEMENT.MARVELOUS]: 2,
	[JUDGEMENT.PERFECT]: 1,
	[JUDGEMENT.GREAT]: -4,
	[JUDGEMENT.GOOD]: -24,
	[JUDGEMENT.BAD]: -44,
	[JUDGEMENT.MISS]: -Infinity,
};

const HP_VALUE: {[key in Judgement]: (drain: number) => number} = {
	[JUDGEMENT.MISS]: (drain) => -(drain + 1) * 0.75,
	[JUDGEMENT.BAD]: (drain) => -(drain + 1) * 0.16,
	[JUDGEMENT.GOOD]: () => 0,
	[JUDGEMENT.GREAT]:(drain) => 0.4 - drain * 0.04,
	[JUDGEMENT.PERFECT]: (drain) => 0.5 - drain * 0.05,
	[JUDGEMENT.MARVELOUS]: (drain) => 0.55 - drain * 0.05,
	[JUDGEMENT.DIVINE]: (drain) => 0.55 - drain * 0.05,
};

export const MAX_HP = 100;

/** osu!'s difficulty-range lerp: `value` 0/5/10 maps to `min`/`mid`/`max`. */
const difficultyRange = (value: number, min: number, mid: number, max: number): number => {
	if (value > 5) return mid + (max - mid) * (value - 5) / 5;
	if (value < 5) return mid - (mid - min) * (5 - value) / 5;
	return mid;
};

/** One object as the drain computation sees it: its time span, the max HP
 *  increases of its nested parts (applied before the overkill check, e.g. a
 *  hold's head + tail), and its own increase (applied after). All in osu's
 *  0..1 HP scale. */
export type HpObject = { start: number, end: number, nested: number[], own: number };

/** Outcome of one perfect-play pass: `dropTooLow` when HP bottomed out mid-play
 *  (the drain is too steep), otherwise the final capped HP and the uncapped HP
 *  used to measure recovery. */
type DrainPass = { dropTooLow: boolean, hp: number, hpUncapped: number };

/** Run one perfect play through the map at a fixed drop rate and HP multiplier. */
const simulateDrainPass = (
	objects: HpObject[], 
	drop: number, 
	multiplier: number,
	lowestHpEver: number,
): DrainPass => {
	let hp = 1;
	let hpUncapped = 1;
	let lastTime = objects[0].start;

	for (const o of objects) {
		const gap = drop * (o.start - lastTime);
		hp = Math.max(0, hp - gap);
		hpUncapped = Math.max(0, hpUncapped - gap);
		lastTime = o.end;

		if (hp <= lowestHpEver) return {
			dropTooLow: true, hp, hpUncapped, 
		};

		const reduction = drop * (o.end - o.start);
		const overkill = Math.max(0, reduction - hp);
		hp = Math.max(0, hp - reduction);
		hpUncapped = Math.max(0, hpUncapped - reduction);

		for (const inc of o.nested) {
			hpUncapped += multiplier * inc;
			hp = Math.max(0, Math.min(1, hp + multiplier * inc));
		}

		if (overkill > 0 && hp - overkill <= lowestHpEver) return {
			dropTooLow: true, hp, hpUncapped, 
		};

		hpUncapped += multiplier * o.own;
		hp = Math.max(0, Math.min(1, hp + multiplier * o.own));
	}

	return {
		dropTooLow: false, hp, hpUncapped, 
	};
};

/**
 * Port of osu!mania's `HpMultiplierNormal`. Mania has no passive HP drain, so
 * its drain computation exists only to find the multiplier that scales positive
 * HP gains up until a perfect play recovers enough health on this map. Computed
 * once per map (not per note) - mirrors osu's iterative search over a perfect
 * play. Negative HP changes are never multiplied.
 */
export const computeHpMultiplier = (objects: HpObject[], drain: number): number => {
	if (objects.length === 0) return 1;

	const ordered = [...objects].sort((a, b) => a.start - b.start);
	const lowestHpEver = difficultyRange(drain, 0.975, 0.8, 0.3);
	const lowestHpEnd = difficultyRange(drain, 0.99, 0.9, 0.4);
	const hpRecoveryAvailable = difficultyRange(drain, 0.04, 0.02, 0);

	let multiplier = 1;
	let testDrop = 0.00025;

	while (true) {
		const pass = simulateDrainPass(ordered, testDrop, multiplier, lowestHpEver);

		if (pass.dropTooLow) { testDrop *= 0.96; continue; }

		// End HP too low: ease the drop and boost recovery.
		if (pass.hp < lowestHpEnd) { testDrop *= 0.94; multiplier *= 1.01; continue; }

		// Not enough average recovery across the map: boost the multiplier.
		if ((pass.hpUncapped - 1) / ordered.length < hpRecoveryAvailable) { 
			testDrop *= 0.96; 
			multiplier *= 1.01;
			continue; 
		}

		// Diverged (a map that can never sustain HP) - osu passes with no boost.
		return isFinite(multiplier) ? multiplier : 1;
	}
};

/** The max-result HP increase of a single hit (osu 0..1 scale), used to build
 *  the perfect play the multiplier search runs over. */
export const maxHpIncrease = (drain: number): number => 0.0055 - drain * 0.0005;

export type HitWindows = {[key in Judgement]: number};

export const DIVINE_WINDOW = 6;

/** `divine` comes from the character's rebirth unlocks. Locked, its window is
 *  negative so no offset can ever fall in it. */
export function maniaWindows(od: number, divine = false, scale = 1): HitWindows {
	return {
		[JUDGEMENT.DIVINE]: divine ? DIVINE_WINDOW * scale : -1,
		[JUDGEMENT.MARVELOUS]: 16.5 * scale,
		[JUDGEMENT.PERFECT]: (64 - 3 * od) * scale,
		[JUDGEMENT.GREAT]: (97 - 3 * od) * scale,
		[JUDGEMENT.GOOD]: (127 - 3 * od) * scale,
		[JUDGEMENT.BAD]: (151 - 3 * od) * scale,
		[JUDGEMENT.MISS]: (188 - 3 * od) * scale,
	};
}

export function judge(absOffsetMs: number, w: HitWindows): Judgement {
	if (absOffsetMs <= w[JUDGEMENT.DIVINE]) return JUDGEMENT.DIVINE;
	if (absOffsetMs <= w[JUDGEMENT.MARVELOUS]) return JUDGEMENT.MARVELOUS;
	if (absOffsetMs <= w[JUDGEMENT.PERFECT]) return JUDGEMENT.PERFECT;
	if (absOffsetMs <= w[JUDGEMENT.GREAT]) return JUDGEMENT.GREAT;
	if (absOffsetMs <= w[JUDGEMENT.GOOD]) return JUDGEMENT.GOOD;
	if (absOffsetMs <= w[JUDGEMENT.BAD]) return JUDGEMENT.BAD;
	return JUDGEMENT.MISS;
}

/** One osu!mania hold-note tier: the maximum head error and maximum combined
 *  (head + tail) error a hold may have to earn `judgement`. */
export type HoldTier = { judgement: Judgement, head: number, combined: number };

export function holdTiers(w: HitWindows): HoldTier[] {
	return [
		{
			judgement: JUDGEMENT.DIVINE, head: w[JUDGEMENT.DIVINE] * 1.2, combined: w[JUDGEMENT.DIVINE] * 2.4, 
		},
		{
			judgement: JUDGEMENT.MARVELOUS, head: w[JUDGEMENT.MARVELOUS] * 1.2, combined: w[JUDGEMENT.MARVELOUS] * 2.4, 
		},
		{
			judgement: JUDGEMENT.PERFECT, head: w[JUDGEMENT.PERFECT] * 1.1, combined: w[JUDGEMENT.PERFECT] * 2.2, 
		},
		{
			judgement: JUDGEMENT.GREAT, head: w[JUDGEMENT.GREAT], combined: w[JUDGEMENT.GREAT] * 2, 
		},
		{
			judgement: JUDGEMENT.GOOD, head: w[JUDGEMENT.GOOD], combined: w[JUDGEMENT.GOOD] * 2, 
		},
	];
}

export function judgeHold(headErr: number, tailErr: number, w: HitWindows): Judgement {
	const combined = headErr + tailErr;
	for (const tier of holdTiers(w)) {
		if (headErr <= tier.head && combined <= tier.combined) return tier.judgement;
	}
	return JUDGEMENT.BAD;
}

/** A release on its own: its long note's judgement when the press was clean - a
 *  miss once it leaves the tail's window (early past BAD, late past GOOD). */
export function judgeRelease(release: number, w: HitWindows): Judgement {
	if (release > w[JUDGEMENT.GOOD] || release < -w[JUDGEMENT.BAD]) return JUDGEMENT.MISS;
	return judgeHold(0, Math.abs(release), w);
}

const MAX_SCORE = 1_000_000;

/** Running score / combo / accuracy state for a play. */
export class ScoreState {
	readonly counts: Record<Judgement, number> = {
		[JUDGEMENT.DIVINE]: 0,
		[JUDGEMENT.MARVELOUS]: 0,
		[JUDGEMENT.PERFECT]: 0,
		[JUDGEMENT.GREAT]: 0,
		[JUDGEMENT.GOOD]: 0,
		[JUDGEMENT.BAD]: 0,
		[JUDGEMENT.MISS]: 0,
	};
	combo = 0;
	maxCombo = 0;
	score = 0;
	/** current health (0..MAX_HP); drains on bad hits, restores on good ones */
	hp = MAX_HP;
	/** 1-based judgement index at which HP first hit 0, or -1 if never failed */
	failedIndex = -1;
	private accEarned = 0;
	private accPossible = 0;
	private bonus = 100;
	private judged = 0;

	/**
	 * @param maxObjects total number of judgements the play will have, used to
	 *   normalise the score to 1,000,000. When 0, the running judged count is
	 *   used (so the score reflects only what has been judged so far).
	 * @param noFail when set, HP draining to 0 never marks the play failed
	 *   (used by the local debug play).
	 */
	constructor(
		private readonly hp_diff: number,
		private readonly od: number,
		private readonly maxObjects = 0,
		private readonly noFail = false,
		/** osu!mania's per-map HP gain multiplier (`computeHpMultiplier`); scales
		 *  positive HP changes only. 1 leaves gains at the raw drain-rate values. */
		private readonly hpMultiplier = 1,
		/** the character has divine unlocked, so an untouched play already sits at
		 *  Z and drops to X on the first marvelous. Availability, not a landed hit. */
		private readonly divineUnlocked = false,
		/** what a slowed-down play keeps of its score (`scoreMultiplier` in rate.ts) */
		private readonly scoreMultiplier = 1,
		/** SD / PF: the worst judgement the play survives (`worstAllowed` in mods.ts) */
		private readonly worstAllowed?: Judgement,
	) {
		this.od = this.od; // prevent unused var warning
	}

	/** Wipe all running state back to the start - used to rewind a play (seek). */
	reset(): void {
		for (const j of Object.keys(this.counts) as Judgement[]) this.counts[j] = 0;
		this.combo = 0;
		this.maxCombo = 0;
		this.score = 0;
		this.hp = MAX_HP;
		this.failedIndex = -1;
		this.accEarned = 0;
		this.accPossible = 0;
		this.bonus = 100;
		this.judged = 0;
	}

	add(j: Judgement): void {
		this.counts[j]++;
		this.judged++;
		this.accEarned += ACCURACY[j];
		this.accPossible += ACCURACY[JUDGEMENT.MARVELOUS];

		this.bonus = clamp(this.bonus + HIT_BONUS[j], 0, 100);

		const hpChange = HP_VALUE[j](this.hp_diff);
		this.hp = clamp(this.hp + (hpChange > 0 ? hpChange * this.hpMultiplier : hpChange), 0, MAX_HP);
		const dead = this.hp <= 0 || failsOn(j, this.worstAllowed);
		if (!this.noFail && dead && this.failedIndex < 0) this.failedIndex = this.judged;

		const max = MAX_SCORE * 0.5 / this.maxObjects;
		const base_score = max * (HIT_VALUE[j] / HIT_VALUE[JUDGEMENT.MARVELOUS]);
		const bonus_score = max * (BONUS_VALUE[j] * Math.sqrt(this.bonus) / HIT_VALUE[JUDGEMENT.MARVELOUS]);
		this.score += (base_score + bonus_score) * this.scoreMultiplier;

		if (j === JUDGEMENT.MISS) {
			this.combo = 0;
		} else {
			this.combo++;
			if (this.combo > this.maxCombo) this.maxCombo = this.combo;
		}
	}

	/** Nothing below marvelous landed. The divine accuracy bonus and the top two
	 *  grades all hang on this, and a pure play is exactly a 1M play. */
	get pure(): boolean {
		return this.counts[JUDGEMENT.PERFECT] === 0
			&& this.counts[JUDGEMENT.GREAT] === 0
			&& this.counts[JUDGEMENT.GOOD] === 0
			&& this.counts[JUDGEMENT.BAD] === 0
			&& this.counts[JUDGEMENT.MISS] === 0;
	}

	/** The divine bonus is applied here rather than accumulated into accEarned:
	 *  one late GREAT has to take back every divine bonus already earned. */
	get accuracy(): number {
		if (this.accPossible === 0) return 1;
		const bonus = this.pure
			? this.counts[JUDGEMENT.DIVINE] * DIVINE_ACCURACY_BONUS
			: 0;
		return (this.accEarned + bonus) / this.accPossible;
	}

	get MISS(): number {
		return this.counts[JUDGEMENT.MISS];
	}

	get failed(): boolean {
		return this.failedIndex >= 0;
	}

	get grade (): Grade {
		if (this.failed) return GRADE.D;
		if (this.pure) {
			// nothing below marvelous has landed, so the play is still X at worst.
			// It reads Z while no marvelous has spoiled it - from the very first
			// note when divine is available, dropping to X the moment one lands.
			const spoiled = this.counts[JUDGEMENT.MARVELOUS] > 0;
			const divine = this.counts[JUDGEMENT.DIVINE] > 0 || this.divineUnlocked;
			return !spoiled && divine ? GRADE.XX : GRADE.X;
		}
		if (this.accuracy >= 1) return GRADE.SS;
		if (this.accuracy >= 0.95) return GRADE.S;
		if (this.accuracy >= 0.9) return GRADE.A;
		if (this.accuracy >= 0.8) return GRADE.B;
		if (this.accuracy >= 0.7) return GRADE.C;
		return GRADE.D;
	}
}

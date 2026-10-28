import cubic_bezier from './math/cubic_bezier.js';
import lerp from './math/lerp.js';

/** The character's fatigue in strained minutes, as of `at` (ms). */
export type Fatigue = { at: number, minutes: number };

// A play strained for at most LIGHT_SHARE of its length rests a minute per minute,
// like idle (the gaps between queued maps included); past it, the play eases up to
// tiring STRAIN_RATE minutes per minute fully strained: a fully strained map takes 3
// easy ones to rest. Past 5 hours of fatigue it starts to tell and reaches the
// floor at 7. Strain stops counting at STRAIN_CAP: every curve below is clamped to
// end by then.
const LIGHT_SHARE = 0.2;
const STRAIN_RATE = 3;
export const STRAIN_CAP = 7 * 60;
const ONSET_MINUTES = 5 * 60;
const FULL_MINUTES = 7 * 60;
const FATIGUE_CB = cubic_bezier(.4, 0, .6, 1);
// exhausted, the physical skills play with a quarter of their xp and earn XP_FLOOR
// of their gains: one map on loop averages about x0.1 a day
const PLAY_FLOOR = 0.25;
const XP_FLOOR = 0.05;
// The same strained minutes warm the character up over 1h (WARM_EARLY before the
// peak's 1h30 end), then cool it to half at 5 hours and cold at 6. Cold, a physical skill plays with COLD_FLOOR of its xp
// from level COLD_LEVEL, less below; warm-up never touches xp gains. Each stamina
// gear up to GEAR_LADDER warms GEAR_SPEED faster and holds the peak GEAR_HOLD
// longer; each tier past it is worth GEAR_DECAY of the one before.
const WARM_MINUTES = 90;
const WARM_EARLY = 30;
const GEAR_LADDER = 10;
const GEAR_SPEED = 0.1;
const GEAR_HOLD = 3;
const GEAR_DECAY = 0.7;
const HALF_WARM_MINUTES = 5 * 60;
const COLD_MINUTES = 6 * 60;
const COLD_FLOOR = 0.5;
const COLD_LEVEL = 100;

/** The fatigue left at `now`, rested since the last play. */
export const restedFatigue = (fatigue: Fatigue | undefined, now: number): number =>
	Math.max(0, (fatigue?.minutes ?? 0) - Math.max(0, now - (fatigue?.at ?? now)) / 60_000);

/** How far `minutes` are from `from` to `to`, eased: 0 before, 1 from `to` on. */
const ease = (minutes: number, from: number, to: number): number =>
	to > from ? FATIGUE_CB((minutes - from) / (to - from)) : Number(minutes >= to);

/** How tired `minutes` of fatigue leave the character: 0 rested, 1 exhausted. */
export const fatigueLevel = (minutes: number): number => {
	const full = Math.min(FULL_MINUTES, STRAIN_CAP);
	return ease(minutes, Math.min(ONSET_MINUTES, full), full);
};

/** The stamina gear warm-up counts with: the ladder's, then tiers worth less and less. */
const warmGear = (upgrades: number): number => {
	const tiers = Math.max(0, upgrades - GEAR_LADDER);
	return Math.min(upgrades, GEAR_LADDER) + (1 - GEAR_DECAY ** tiers) / (1 - GEAR_DECAY);
};

/** The strained minutes where warm-up peaks, starts cooling, is half and is cold, with `upgrades` stamina gear. */
export const warmupCurve = (upgrades = 0) => {
	const gear = warmGear(upgrades);
	const cold = Math.min(COLD_MINUTES + gear * GEAR_HOLD, STRAIN_CAP);
	const half = Math.min(HALF_WARM_MINUTES + gear * GEAR_HOLD, cold);
	const peakEnd = Math.min(WARM_MINUTES + gear * GEAR_HOLD, half);
	const warm = Math.min(WARM_MINUTES / (1 + gear * GEAR_SPEED) - WARM_EARLY, peakEnd);
	return {
		warm, peakEnd, half, cold,
	};
};

/** How warmed up `minutes` of fatigue leave a character with `upgrades` stamina gear: 0 cold, 1 warm. */
export const warmup = (minutes: number, upgrades = 0): number => {
	const {
		warm, peakEnd, half, cold,
	} = warmupCurve(upgrades);
	if (minutes < warm) return ease(minutes, 0, warm);
	if (minutes < half) return lerp(1, 0.5, ease(minutes, peakEnd, half));
	return lerp(0.5, 0, ease(minutes, half, cold));
};

// The warm-up bar reads like a hit error bar: cold at the left, the sweet spot
// (warm-up from SWEET_SPOT) in the middle, past the peak right of it and fatigue at
// the right end. More strain always moves it right, rest left.
const SWEET_SPOT = 0.9;
/** Where the warm-up bar's sweet spot, past-peak and fatigued zones start. */
export const BAR_ZONES = [0.4, 0.6, 0.8] as const;

/** Where in [lo, hi] `turned` flips from false to true. */
const crossing = (turned: (m: number) => boolean, lo: number, hi: number): number => {
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (turned(mid)) hi = mid;
		else lo = mid;
	}
	return hi;
};

/** Where `minutes` of fatigue sit on the warm-up bar, 0 to 1, with `upgrades` stamina gear. */
export const warmupBar = (minutes: number, upgrades = 0): number => {
	const { warm, peakEnd, cold } = warmupCurve(upgrades);
	const onset = Math.min(ONSET_MINUTES, FULL_MINUTES, STRAIN_CAP);
	const sweetEnd = crossing(m => warmup(m, upgrades) < SWEET_SPOT, peakEnd, cold);
	const knots = [
		0,
		crossing(m => warmup(m, upgrades) >= SWEET_SPOT, 0, warm),
		Math.min(sweetEnd, onset),
		onset,
		STRAIN_CAP,
	];
	const at = [0, ...BAR_ZONES, 1];
	let i = 1;
	while (i < knots.length - 1 && minutes > knots[i]) i++;
	const span = knots[i] - knots[i - 1];
	const t = span > 0 ? (minutes - knots[i - 1]) / span : 1;
	return lerp(at[i - 1], at[i], Math.min(1, Math.max(0, t)));
};

/** The fatigue minutes a play `minutes` long, `strained` of them, adds: less than 0 rests. */
const playedStrain = (minutes: number, strained: number): number =>
	(minutes > 0 ? minutes * lerp(-1, STRAIN_RATE, ease(strained / minutes, LIGHT_SHARE, 1)) : 0);

/** Which way and how hard a play `minutes` long, `strained` of them, moves the
 *  warm-up bar: 1 to 3 right (warming), -1 to -3 left (cooling), 0 neither. */
export const warmupTrend = (minutes: number, strained: number): number => {
	if (minutes <= 0) return 0;
	// fatigue minutes per minute played: STRAIN_RATE fully strained, -1 light
	const drift = playedStrain(minutes, strained) / minutes;
	return drift >= 0
		? Math.ceil(Math.min(1, drift / STRAIN_RATE) * 3)
		: -Math.ceil(Math.min(1, -drift) * 3);
};

/** The share of the physical skills' xp gains a play at fatigue `level` keeps. */
export const fatigueXp = (level: number): number => lerp(1, XP_FLOOR, level);

/** The fatigue after a play that ended `now`, `minutes` long, `strained` of them. */
export const afterPlay = (
	before: Fatigue | undefined,
	minutes: number,
	strained: number,
	now: number,
): Fatigue => {
	const rested = restedFatigue(before, now - minutes * 60_000);
	const next = rested + playedStrain(minutes, strained);
	return {
		at: now, minutes: Math.min(STRAIN_CAP, Math.max(0, next)),
	};
};

/** The share of the xp behind its level a physical skill at `level` plays with, at
 *  fatigue `fatigue` and warm-up `warm`. */
export const keptShare = (level: number, fatigue: number, warm = 1): number => {
	const cold = lerp(1, COLD_FLOOR, Math.min(1, level / COLD_LEVEL));
	return lerp(1, PLAY_FLOOR, fatigue) * lerp(cold, 1, warm);
};

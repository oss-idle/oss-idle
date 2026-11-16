import {
	Big,
	type BigLike,
} from './big.js';
import cubic_bezier from './math/cubic_bezier.js';

const progressionCurve = cubic_bezier(.1, .4, .95, 0);
const lateProgressionCurve = cubic_bezier(.5, 0, 1, .4);

export const LATE_LEVEL_XP = 10_000_000;
/** Every TIER levels past 100, late levels cost TIER_STEP times more again:
 *  x1.25 from 110, x1.56 from 120, x1.95 from 130. */
const TIER = 10;
const TIER_STEP = 1.25;

export const lateLevelXp = (level: number): number => {
	if (level < 100) return 0;
	const steps = level - 99;
	return steps * (steps + 1) / 2 * LATE_LEVEL_XP * TIER_STEP ** Math.floor((level - 100) / TIER);
};

const earlyXpForLevel = (level: number): number => 100
	+ (progressionCurve(level / 100) * 9900)
	+ (lateProgressionCurve((level - 60) / 40) * 90000)
	+ lateLevelXp(level);

/** Levels 100 and up: the early curves are spent, past that only the late part grows. */
const LATE_BASE = 100_000;
const STEP = Big.from(TIER_STEP);
const LOG_STEP = Math.log10(TIER_STEP);

const tierOf = (level: number): number => Math.floor((level - 100) / TIER);
const triangle = (s: number): number => s * (s + 1) / 2;

export const xpForLevel = (level: number): Big => {
	if (level < 100) return Big.from(earlyXpForLevel(level));
	return STEP.pow(tierOf(level)).mul(triangle(level - 99) * LATE_LEVEL_XP).add(LATE_BASE);
};

const CUMULATIVE: number[] = [0];
for (let i = 0; i < 100; i++) CUMULATIVE.push(CUMULATIVE[i] + earlyXpForLevel(i));

/** What a whole tier `k` of late levels adds up to, before its TIER_STEP ** k. */
export const P = (k: number): number => {
	let sum = 0;
	for (let s = TIER * k + 1; s <= TIER * k + TIER; s++) sum += triangle(s);
	return sum;
};

/** Solves TIER_STEP * Q(k + 1) - Q(k) = P(k), so the tiers below n add up to
 *  TIER_STEP ** n * Q(n) - Q(0). P is quadratic, so Q's cubic term is 0. */
export const Q = (k: number): number => 2000 * k * k - 17600 * k + 78880;

export const xpToLevel = (level: number): Big => {
	const top = Math.ceil(level);
	if (top <= 100) return Big.from(CUMULATIVE[Math.max(0, top)]);
	const n = tierOf(top);
	let partial = 0;
	for (let j = 1; j <= top - 100 - TIER * n; j++) partial += triangle(TIER * n + j);
	return STEP.pow(n).mul(Q(n) + partial).sub(Q(0)).mul(LATE_LEVEL_XP)
		.add(CUMULATIVE[100] + LATE_BASE * (top - 100));
};

/** xp held at `level` plus the `xp` banked inside it. */
export const heldTotal = (level: number, xp: BigLike): Big => xpToLevel(level).add(xp);

/** Whether reaching `level` costs more than `total`. Its tier settles most levels
 *  without summing: xpToLevel(level) >= TIER_STEP ** tier from level 1, and from 100 up
 *  xpToLevel(level) <= level * xpForLevel(level) <= 2e7 * level ** 3 * TIER_STEP ** tier. */
const costsMore = (level: number, total: Big): boolean => {
	const tier = tierOf(level) * LOG_STEP;
	const log = total.log10();
	if (tier > log) return true;
	if (level > 100 && tier + 3 * Math.log10(level) + Math.log10(2e7) < log) return false;
	return xpToLevel(level).gt(total);
};

export const xpGivesLevel = (xp: BigLike): { level: number, xp: Big } => {
	const total = Big.from(xp);
	let lo = 0;
	let hi = 128;
	while (!costsMore(hi, total)) {
		lo = hi;
		hi *= 2;
	}
	for (;;) {
		const mid = Math.floor((lo + hi) / 2);
		if (mid === lo || mid === hi) break;
		if (costsMore(mid, total)) hi = mid;
		else lo = mid;
	}
	return {
		level: lo,
		xp: total.sub(xpToLevel(lo)),
	};
};

/** Level up while `xp` is more than the level costs; equal stays. */
const settle = (level: number, xp: Big, steps: number): { level: number, xp: Big } => {
	for (let i = 0; i < steps && level + 1 !== level && xp.gt(xpForLevel(level)); i++) {
		xp = xp.sub(xpForLevel(level));
		level++;
	}
	return {
		level, xp,
	};
};

/** `gained` xp added on top of `xp` into `level`: where it lands, and how many levels it crossed.
 *  Walks the early levels like the table was summed, jumps from 100 up. */
export const gainLevels = (level: number, xp: BigLike, gained: BigLike) => {
	let at = settle(level, Big.from(xp).add(gained), Math.max(0, 100 - level));
	if (at.xp.gt(xpForLevel(at.level))) {
		const total = heldTotal(at.level, at.xp);
		const jump = Math.max(at.level, xpGivesLevel(total).level - 1);
		at = settle(jump, total.sub(xpToLevel(jump)), 2);
	}
	return {
		...at, levels: at.level - level,
	};
};

/** Progress through a level, as a fraction of what the next one costs. */
export const levelProgress = (level: number, xp: BigLike): number =>
	Math.min(1, Math.max(0, Big.from(xp).div(xpForLevel(level)).toNumber()));

/** An xp level and its progress plus any prestige bonus. */
export const effectiveLevelOf = (level: number, xp: BigLike, prestige = 0): number =>
	level + levelProgress(level, xp) + prestige;

/** The level a skill plays at and is shown at: what all the xp it ever earned buys -
 *  prestiges and upgrades never take that back - plus prestige's bonus. Never below the
 *  level it holds, for skills set by level alone. */
export const playLevelOf = (
	level: number, xp: BigLike, lifetimeXp: BigLike, prestige = 0,
): number => {
	const lifetime = xpGivesLevel(lifetimeXp);
	return Math.max(
		level + levelProgress(level, xp),
		lifetime.level + levelProgress(lifetime.level, lifetime.xp),
	) + prestige;
};

/** The admin XP gains band a play level counts in: ten levels a band below 100,
 *  one per level from there. */
export const xpGainBand = (level: number): number =>
	(level < 100 ? Math.floor(level / 10) * 10 : Math.floor(level));

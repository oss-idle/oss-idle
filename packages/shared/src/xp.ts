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

export const xpForLevel = (level: number): number => {
	return 100
		+ (progressionCurve(level / 100) * 9900)
		+ (lateProgressionCurve((level - 60) / 40) * 90000)
		+ lateLevelXp(level);
};

export const xpToLevel = (level: number): number => {
	let total = 0;
	for (let i = 0; i < level; i++) {
		total += xpForLevel(i);
	}
	return total;
};

export const xpGivesLevel = (xp: number): { level: number, xp: number } => {
	let level = 0;
	do {
		const nextXP = xpForLevel(level);
		if (xp < nextXP) break;
		xp -= nextXP;
		level++;
	} while(true);
	
	return {
		level,
		xp,
	};
};

/** `gained` xp added on top of `xp` into `level`: where it lands, and how many levels it crossed. */
export const gainLevels = (level: number, xp: number, gained: number) => {
	xp += gained;
	let levels = 0;
	while (xp > xpForLevel(level)) {
		xp -= xpForLevel(level);
		level++;
		levels++;
	}
	return {
		level, xp, levels,
	};
};

/** Progress through a level, as a fraction of what the next one costs. */
export const levelProgress = (level: number, xp: number): number => {
	const needed = xpForLevel(level);
	if (!(needed > 0)) return 0;
	return Math.min(1, Math.max(0, xp / needed));
};

/** An xp level and its progress plus any prestige bonus. */
export const effectiveLevelOf = (level: number, xp: number, prestige = 0): number =>
	level + levelProgress(level, xp) + prestige;

/** The level a skill plays at and is shown at: what all the xp it ever earned buys -
 *  prestiges and upgrades never take that back - plus prestige's bonus. Never below the
 *  level it holds, for skills set by level alone. */
export const playLevelOf = (
	level: number, xp: number, lifetimeXp: number, prestige = 0,
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

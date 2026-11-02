import type { Grade } from '@oss-idle/shared/grade';
import { JUDGEMENT } from '@oss-idle/shared/rulesets/mania/judgement';

/**
 * The lowest levels that can reach a player's real scores. A score proves what the player can
 * do and says nothing of what they can't, so a weak one lowers nothing. All skills climb
 * together, each with the others out of its way, until every score is within reach. A level
 * answers for how the notes it got to were played: failing a map alone lifts nothing.
 * Accuracy is read from the player's timing instead: see {@link accuracyFromTiming}.
 */

/** The judgements, best first. */
const TIERS = [
	JUDGEMENT.MARVELOUS, JUDGEMENT.PERFECT, JUDGEMENT.GREAT, JUDGEMENT.GOOD, JUDGEMENT.BAD,
] as const;

export type Counts = Record<(typeof TIERS)[number] | typeof JUDGEMENT.MISS, number>;

export type Target = { counts: Counts };

export type BotMatchLevels = Record<string, number>;

export const CEILING = 130;
/** How close a level gets to the score that asks for it. */
const PRECISION = 0.25;
/** A real best took many tries too. */
const TRIES = 20;
/** Past this, a score tells how many tries it took more than what the player can do. */
const MOST_PROVEN = 0.995;

/** Timing: a good ratio on hard maps, and being able to get an insane one on easy maps. */
const TIMED_NOTES = 500;
const EASY_BELOW_STARS = 4;
const HARD_FROM_STARS = 5;
const TOP_SHARE = 0.9;
const MOST_RATIO = 1000;
/** Two points of the scale from timing to level: each tenfold of ratio is the same step. */
const TIMING_LOW = {
	ratio: 11.4, level: 105,
};
const TIMING_HIGH = {
	ratio: 42, level: 125,
};

/** How far a fit has got, and the level each skill has climbed to. */
export type FitProgress = {
	levels: BotMatchLevels,
	/** how far the final run has got, once it has begun */
	final?: { done: number, total: number },
};

/** A simulated play. */
export type Played = Counts & { failed?: boolean, pp?: number, grade?: Grade };

export type PlayOf = (levels: BotMatchLevels, target: Target) => Promise<Played>;

/** A MARVELOUS and a PERFECT are worth the same: an X is a play of nothing else. */
export const accuracyOf = (counts: Counts): number => {
	const best = counts[JUDGEMENT.MARVELOUS] + counts[JUDGEMENT.PERFECT];
	const points = 300 * best + 200 * counts[JUDGEMENT.GREAT]
		+ 100 * counts[JUDGEMENT.GOOD] + 50 * counts[JUDGEMENT.BAD];
	return points / (300 * Math.max(1, notesOf(counts)));
};

const hundredths = (level: number) => Math.round(level * 100) / 100;

const notesOf = (counts: Counts) =>
	TIERS.reduce((sum, tier) => sum + counts[tier], counts[JUDGEMENT.MISS]);

/** MARVELOUS against everything else. */
const ratioOf = (counts: Counts) => Math.min(
	MOST_RATIO,
	counts[JUDGEMENT.MARVELOUS] / Math.max(1, notesOf(counts) - counts[JUDGEMENT.MARVELOUS]),
);

export type TimedScore = Target & { stars: number, rate: number };

/** The Accuracy a player's real timing reads as. */
export const accuracyFromTiming = (scores: readonly TimedScore[]): number => {
	const timed = scores.filter(({ counts, rate }) => rate === 1 && notesOf(counts) >= TIMED_NOTES);
	const tops = [
		timed.filter(({ stars }) => stars < EASY_BELOW_STARS),
		timed.filter(({ stars }) => stars >= HARD_FROM_STARS),
	].filter(band => band.length).map(band => {
		const ratios = band.map(({ counts }) => ratioOf(counts)).toSorted((a, b) => a - b);
		return Math.log10(ratios[Math.floor(ratios.length * TOP_SHARE)]!);
	});
	const mixed = tops.reduce((sum, top) => sum + top, 0) / Math.max(1, tops.length);
	const low = Math.log10(TIMING_LOW.ratio);
	const perTenfold = (TIMING_HIGH.level - TIMING_LOW.level) / (Math.log10(TIMING_HIGH.ratio) - low);
	return hundredths(Math.min(CEILING, Math.max(0, TIMING_LOW.level + perTenfold * (mixed - low))));
};

/** Nothing but MARVELOUS: the 1,000,000 no other play counts as. */
const isPure = (counts: Counts) =>
	[...TIERS.slice(1), JUDGEMENT.MISS].every(tier => !counts[tier]);

export type BotMatchFit<T extends Target = Target> = {
	levels: BotMatchLevels,
	/** how many scores the matched character reached, and both sides' judgements over those */
	reached: number,
	real: Counts,
	bot: Counts,
	/** its best play on each map it cleared */
	plays: { target: T, played: Played }[],
};

const addUp = (all: readonly Counts[]): Counts => {
	const out = Object.fromEntries([...TIERS, JUDGEMENT.MISS].map(tier => [tier, 0])) as Counts;
	for (const counts of all) {
		for (const tier of Object.keys(out) as (keyof Counts)[]) out[tier] += counts[tier];
	}
	return out;
};

/** Whether a play gets a score: all of it when `whole`, else what it proves. */
const gets = (played: Played, target: Target, whole: boolean) => {
	const real = accuracyOf(target.counts);
	const wanted = whole ? real : Math.min(real, MOST_PROVEN);
	return (!whole || !played.failed)
		&& accuracyOf(played) >= wanted
		&& (!isPure(target.counts) || isPure(played));
};

/** Whether any of its tries gets what the score proves. */
const reaches = async (levels: BotMatchLevels, target: Target, playOf: PlayOf) => {
	for (let tried = 0; tried < TRIES; tried++) {
		if (gets(await playOf(levels, target), target, false)) return true;
	}
	return false;
};

/** The tries at the final levels: the first to get the whole score, and the best clear so far. */
const finalTries = async (levels: BotMatchLevels, target: Target, playOf: PlayOf) => {
	let best: Played | undefined;
	for (let tried = 0; tried < TRIES; tried++) {
		const played = await playOf(levels, target);
		if (!played.failed && (played.pp ?? 0) >= (best?.pp ?? 0)) best = played;
		if (gets(played, target, true)) return {
			reach: played, best,
		};
	}
	return { best };
};

/** The levels that reach `scores`, played through `playOf` as each arrives, so every skill climbs
 *  from the first: hardest first, they climb soonest. `report` hears each step up. `known` skills
 *  stay out of the way of the others until the end, when their levels are asked for. `earlier`
 *  carries on from a first fit: its levels climb from where they got to, and its scores count
 *  again in the final run. */
export const fitBot = async <T extends Target>(
	skills: readonly string[],
	scores: Iterable<T> | AsyncIterable<T>,
	playOf: PlayOf,
	report: (progress: FitProgress) => void = () => {},
	known: Record<string, () => number> = {},
	earlier: { levels: BotMatchLevels, targets: readonly T[] } = {
		levels: {}, targets: [],
	},
): Promise<BotMatchFit<T>> => {
	const top: BotMatchLevels = Object.fromEntries(
		[...skills, ...Object.keys(known)].map(skill => [skill, CEILING]),
	);
	const climbing: BotMatchLevels = Object.fromEntries(
		skills.map(skill => [skill, earlier.levels[skill] ?? 0]),
	);

	/** Only a score out of its reach lifts a skill. */
	const climb = async (skill: string, target: T) => {
		const at = (level: number): BotMatchLevels => ({
			...top, [skill]: level,
		});
		if (await reaches(at(climbing[skill]!), target, playOf)) return;
		let high = CEILING;
		while (high - climbing[skill]! > PRECISION) {
			const mid = (climbing[skill]! + high) / 2;
			if (await reaches(at(mid), target, playOf)) high = mid;
			else climbing[skill] = mid;
			report({ levels: climbing });
		}
		climbing[skill] = high;
		report({ levels: climbing });
	};

	const targets = [...earlier.targets];
	for await (const target of scores) {
		targets.push(target);
		// a real score the sim can't reach at all can't speak for any skill
		if (await reaches(top, target, playOf)) {
			await Promise.all(skills.map(skill => climb(skill, target)));
		}
	}

	const levels: BotMatchLevels = {
		...Object.fromEntries(Object.entries(known).map(([skill, level]) => [skill, level()])),
		...Object.fromEntries(skills.map(skill => [skill, hundredths(climbing[skill]!)])),
	};
	let done = 0;
	report({
		levels, final: {
			done, total: targets.length,
		},
	});
	const final = await Promise.all(targets.map(async target => {
		const tries = await finalTries(levels, target, playOf);
		report({
			levels, final: {
				done: ++done, total: targets.length,
			},
		});
		return tries;
	}));
	const reached = targets.flatMap((target, i) => {
		const bot = final[i]!.reach;
		return bot ? [{
			real: target.counts, bot,
		}] : [];
	});
	return {
		levels,
		reached: reached.length,
		real: addUp(reached.map(({ real }) => real)),
		bot: addUp(reached.map(({ bot }) => bot)),
		plays: targets.flatMap((target, i) => {
			const played = final[i]!.best;
			return played ? [{
				target, played,
			}] : [];
		}),
	};
};

/**
 * Where a character stood when it set a play, rebuilt from the dumps on either side
 * of it. Lifetime xp only grows, so the dumps' difference is spread over the plays
 * between them in order; whatever else moved between them (a prestige, warm-up gear,
 * a memory forget) happened at some play we can't tell, so it makes the play
 * ambiguous.
 */
import type { Fatigue } from '@oss-idle/shared/fatigue';
import type { UpgradeState } from '@oss-idle/shared/upgrades';
import { gainLevels } from '@oss-idle/shared/xp';

/** [level, xp, upgrades, overdrive, prestige, lifetime xp], as the snapshots store a skill. */
export type SkillTuple = number[];

export type Profile = { skills: Record<string, SkillTuple>, fatigue?: Fatigue };

/** A dump as one character saw it: absent from it, it had no profile yet. */
export type Anchor = {
	/** the dump's highest score id: every play up to it is in it */
	maxScoreId: number,
	/** the dump's profiles carried fatigue: it was live by then */
	fatigue: boolean,
	profile?: Profile,
};

export type Progress = UpgradeState & { lifetimeXp: number };

export type SkillsAt = {
	/** what the new sim reads: lifetime xp, prestige and gear */
	progress: Record<string, Progress>,
	/** the old sim's held level too, when nothing but xp moved in the window */
	old?: Record<string, Progress>,
	ambiguous: boolean,
};

const ZERO: SkillTuple = [0, 0, 0, 0, 0, 0];

/** Plays (in id order) by the window they fall in: after the last dump before them
 *  (`start`, undefined before the first) and up to the first that holds them. */
export const windowsOf = <T extends { id: number }>(
	anchors: readonly Anchor[], plays: readonly T[],
) => {
	const windows: { start?: Anchor, end: Anchor, plays: T[] }[] = [];
	let e = 0;
	for (const play of plays) {
		while (anchors[e] && anchors[e].maxScoreId < play.id) e++;
		if (!anchors[e]) throw new Error(`score ${play.id} is past the last anchor`);
		if (windows.at(-1)?.end !== anchors[e]) windows.push({
			start: anchors[e - 1], end: anchors[e], plays: [],
		});
		windows.at(-1)!.plays.push(play);
	}
	return windows;
};

/**
 * Each skill `share` of the way through the window (the plays before this one over
 * the plays in it). `discrete` names the skills whose prestige or gear the new sim
 * reads: a change to any of them in the window makes the play ambiguous.
 */
export const skillsAt = (
	start: Anchor | undefined,
	end: Anchor,
	share: number,
	skills: readonly string[],
	discrete: (skill: string, field: 'upgrades' | 'overdrive' | 'prestige') => boolean,
): SkillsAt => {
	const pairs = skills.map(skill => {
		const b = end.profile?.skills[skill];
		// before the first dump, the first skills known after the play: the most it can have had
		const a = start ? start.profile?.skills[skill] ?? ZERO : b ?? ZERO;
		return [skill, a, b ?? a] as const;
	});
	const moved = pairs.flatMap(([skill, a, b]) =>
		([[2, 'upgrades'], [3, 'overdrive'], [4, 'prestige']] as const)
			.filter(([i]) => a[i] !== b[i])
			.map(([, field]) => discrete(skill, field)));
	// a rollback between the dumps takes lifetime xp back
	const rolledBack = pairs.some(([, a, b]) => b[5] < a[5]);
	let ambiguous = start === undefined || moved.includes(true) || rolledBack;
	const exact = start !== undefined && !moved.length;
	const progress: Record<string, Progress> = {};
	const old: Record<string, Progress> = {};
	for (const [skill, a, b] of pairs) {
		const [level, xp, , , , fromXp] = a;
		const lifetimeXp = fromXp + share * Math.max(0, b[5] - fromXp);
		const side = share < 0.5 ? a : b;
		const held = gainLevels(level, xp, lifetimeXp - fromXp);
		old[skill] = {
			level: held.level, xp: held.xp, upgrades: a[2], overdrive: a[3], prestige: a[4], lifetimeXp,
		};
		progress[skill] = {
			// the held level only counts above the lifetime one, and only an exact window knows it
			level: exact ? held.level : 0,
			xp: exact ? held.xp : 0,
			upgrades: side[2],
			overdrive: side[3],
			prestige: side[4],
			lifetimeXp,
		};
	}
	ambiguous ||= start?.fatigue !== end.fatigue;
	return {
		progress, ...exact && !ambiguous && { old }, ambiguous,
	};
};

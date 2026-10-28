import {
	and,
	eq,
} from 'drizzle-orm';
import * as ppjs from 'rosu-pp-js';

import {
	billionsMessage,
	firstPlaceMessage,
	isSkillLevelMilestone,
	ppsMessage,
	skillLevelMessage,
} from '@oss-idle/shared/community/announcements';
import { ANNOUNCE_CHANNEL } from '@oss-idle/shared/community/wire';
import { parseMods } from '@oss-idle/shared/mods';
import { betterScore } from '@oss-idle/shared/scoreOrder';
import {
	gainLevels,
	playLevelOf,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import { db } from './db/client';
import {
	beatmaps,
	getBeatmapById,
} from './db/schema/beatmap';
import { addBeatmapPlayed } from './db/schema/beatmaps_played';
import {
	getBestPlay,
	setNewBestPlay,
} from './db/schema/best';
import {
	getBestPPPlay,
	setNewBestPPPlay,
} from './db/schema/best_pp';
import {
	getCharacterById,
	profileOf,
	type ProfileRow,
	skillColumnsFor,
	skillOf,
} from './db/schema/character';
import {
	getCharacterTotals,
	refreshCharacterTotals,
} from './db/schema/character_totals';
import {
	getFirstPlace,
	setNewFirstPlace,
} from './db/schema/first_place';
import {
	getScoreById,
	type NewScoreRow,
	type ScoreRow,
} from './db/schema/score';
import { judgementsOf } from './db/schema/score';
import {
	getSkillMilestones,
	setSkillMilestone,
} from './db/schema/skill_milestone';
import { calculatePP } from './pp';
import {
	beatmapPageIds,
	reindexCharacter,
	unindexBeatmap,
} from './rankings';
import { rulesetOfBeatmap } from './rulesets/registry';
import type { ServerRuleset } from './rulesets/ruleset';
import { announce } from './ws/chat';

/** Recompute only the character's pp: the weighted (0.95^i) sum of its per-map
 *  best pp, read straight from the `best_pp` table (one row per beatmap). Leaves
 *  total/ranked score untouched. */
export async function recomputePP(
	{ bestPP, profile }: ServerRuleset,
	characterId: number,
): Promise<void> {
	const rows = await db
		.select({ pp: bestPP.pp })
		.from(bestPP)
		.where(eq(bestPP.characterId, characterId));

	const pp = rows
		.map(r => Number(r.pp))
		.sort((a, b) => b - a)
		.reduce((sum, p, i) => sum + p * Math.pow(0.95, i), 0);

	await db
		.update(profile)
		.set({ pp: String(Math.round(pp * 1000) / 1000) })
		.where(eq(profile.id, characterId));
}

/**
 * Erase every trace of a beatmap from player progression: its scores, per-map
 * bests, first places and play counts, with each affected character's totals,
 * pp and ranking index rebalanced. Runs when a difficulty (or its whole set)
 * is unranked. Skill XP is not reverted - there is no per-map XP ledger.
 */
export async function purgeBeatmapScores(beatmapId: number): Promise<void> {
	const ruleset = await rulesetOfBeatmap(beatmapId);
	if (!ruleset) return;
	const {
		score: scores, best, bestPP, firstPlace, played,
	} = ruleset;
	const perCharacter = await db
		.selectDistinct({ characterId: scores.characterId })
		.from(scores)
		.where(eq(scores.beatmapId, beatmapId));
	// No scores, nothing derived from them either.
	if (!perCharacter.length) return;

	await db.delete(best).where(eq(best.beatmapId, beatmapId));
	await db.delete(bestPP).where(eq(bestPP.beatmapId, beatmapId));
	await db.delete(firstPlace).where(eq(firstPlace.beatmapId, beatmapId));
	await db.delete(scores).where(eq(scores.beatmapId, beatmapId));
	await db.delete(played).where(eq(played.beatmapId, beatmapId));
	await db.update(beatmaps).set({ plays: 0 }).where(eq(beatmaps.id, beatmapId));

	await unindexBeatmap(ruleset, beatmapId);
	for (const row of perCharacter) {
		await refreshCharacterTotals(ruleset, row.characterId);
		await recomputePP(ruleset, row.characterId);
		await reindexCharacter(ruleset, row.characterId);
	}
}

/** Whether a difficulty's set is loved: its plays give no pp. */
export const isLovedBeatmap = async ({ setStatus }: ServerRuleset, beatmapId: number) => {
	const [row] = await db.select({ id: beatmaps.id })
		.from(beatmaps)
		.innerJoin(setStatus, eq(setStatus.setId, beatmaps.setId))
		.where(and(eq(beatmaps.id, beatmapId), eq(setStatus.status, 'loved')))
		.limit(1);
	return !!row;
};

/** Insert a score and refresh the character's profile aggregates. The single
 *  entry point for a new ranked play. */
export async function submitScore(ruleset: ServerRuleset, draft: NewScoreRow) {
	const loved = await isLovedBeatmap(ruleset, draft.beatmapId);
	await addBeatmapPlayed(ruleset, draft.characterId, draft.beatmapId);
	const [ins] = await db.insert(ruleset.score).values(loved ? {
		...draft, pp: '0',
	} : draft);
	const score = (await getScoreById(ruleset, ins.insertId))!;
	await onSubmitScore(ruleset, score, true, loved);
	return score;
}

export const onSubmitScore = async (
	ruleset: ServerRuleset,
	score: ScoreRow,
	recompute = true,
	loved?: boolean,
) => {
	const before = (await getCharacterTotals(ruleset, score.characterId)).rankedScore;
	await checkNewBest(ruleset, score);
	await refreshCharacterTotals(ruleset, score.characterId);
	const after = (await getCharacterTotals(ruleset, score.characterId)).rankedScore;
	if (Math.floor(after / 1_000_000_000) > Math.floor(before / 1_000_000_000)) {
		await announceBillions(score, after);
	}
	if (!(loved ?? await isLovedBeatmap(ruleset, score.beatmapId))) {
		await checkNewBestPP(ruleset, score, recompute);
	}
	await checkNewFirstPlace(ruleset, score);
};

/**
 * Reprice a difficulty's scores after its set moved between ranked and loved:
 * loved gives no pp, ranked prices every score again from what it stored. Scores,
 * bests, #1s and ranked score stay; pp, top plays and the pp ranking follow.
 */
export const repriceBeatmapScores = async (beatmapId: number, loved: boolean): Promise<void> => {
	const ruleset = await rulesetOfBeatmap(beatmapId);
	if (!ruleset) return;
	const {
		def, score: scores, best, bestPP, firstPlace,
	} = ruleset;
	const rows = await db.select().from(scores).where(eq(scores.beatmapId, beatmapId));
	if (!rows.length) return;

	const chart = loved ? undefined : (await getBeatmapById(beatmapId))?.chart;
	const map = chart ? new ppjs.Beatmap(chart) : undefined;
	const priced = rows.map(row => ({
		...row,
		pp: String(map ? calculatePP(def, {
			score: row.score,
			accuracy: Number(row.accuracy),
			maxCombo: row.maxCombo,
			counts: judgementsOf(row, def),
		}, map, Number(row.rate), parseMods(row.mods)) : 0),
	}));
	// bests and #1s are copies of their score: keep their pp in step
	for (const row of priced) {
		for (const table of [scores, best, firstPlace]) {
			await db.update(table).set({ pp: row.pp }).where(eq(table.id, row.id));
		}
	}

	await db.delete(bestPP).where(eq(bestPP.beatmapId, beatmapId));
	const characterIds = new Set(priced.map(row => row.characterId));
	if (!loved) {
		const top = new Map<number, ScoreRow>();
		for (const row of priced) {
			const held = top.get(row.characterId);
			if (!held || compareScoresPP(row, held)) top.set(row.characterId, row);
		}
		for (const row of top.values()) await setNewBestPPPlay(ruleset, row);
	}
	for (const characterId of characterIds) {
		await recomputePP(ruleset, characterId);
		await reindexCharacter(ruleset, characterId);
	}
};

export const compareScores = (s1: ScoreRow, s2: ScoreRow) => betterScore(s1, s2);

export const compareScoresPP = (s1: ScoreRow, s2: ScoreRow) => {
	const d1 = parseFloat(s1.pp) - parseFloat(s2.pp);
	if (isNaN(d1)) return false;
	if (d1 !== 0) return d1 > 0;
	return (s1.id - s2.id) < 0;
};

export const checkNewBest = async (ruleset: ServerRuleset, score: ScoreRow) => {
	const best = await getBestPlay(ruleset, score.characterId, score.beatmapId);
	if (best && compareScores(best, score)) return;
	await setNewBestPlay(ruleset, score);
};

export const checkNewBestPP = async (ruleset: ServerRuleset, score: ScoreRow, recompute = true) => {
	const best = await getBestPPPlay(ruleset, score.characterId, score.beatmapId);
	if (best && compareScoresPP(best, score)) return;

	await setNewBestPPPlay(ruleset, score);
	if (recompute) {
		const before = await profileOf(ruleset, score.characterId);
		await recomputePP(ruleset, score.characterId);
		const after = await profileOf(ruleset, score.characterId);

		if (Math.floor(Number(after.pp) / 1000) > Math.floor(Number(before.pp) / 1000)) {
			void announcePps(after);
		}
	}
};

export const checkNewFirstPlace = async (ruleset: ServerRuleset, score: ScoreRow) => {
	const best = await getFirstPlace(ruleset, score.beatmapId);
	if (best && compareScores(best, score)) return;

	await setNewFirstPlace(ruleset, score);
	// Beating your own #1 is not news.
	if (best?.characterId === score.characterId) return;
	await announceFirstPlace(score);
};

/** Hand a map's #1 to whoever now tops its leaderboard (a restriction lifted or set). */
export const recomputeFirstPlace = async (beatmapId: number) => {
	const ruleset = await rulesetOfBeatmap(beatmapId);
	if (!ruleset) return;
	const [top] = await beatmapPageIds(ruleset, beatmapId, 1);
	const row = top === undefined ? undefined : await getBestPlay(ruleset, top, beatmapId);
	if (row) await setNewFirstPlace(ruleset, row);
	else await db.delete(ruleset.firstPlace).where(eq(ruleset.firstPlace.beatmapId, beatmapId));
};

/** Server-announce a new #1 in chat (a "perfect" variant for a max score). */
const announceFirstPlace = async (score: ScoreRow) => {
	const [character, beatmap] = await Promise.all([
		getCharacterById(score.characterId),
		getBeatmapById(score.beatmapId),
	]);
	if (!character || !beatmap) return;

	const perfect = score.score >= 1_000_000;
	announce(
		ANNOUNCE_CHANNEL, 
		firstPlaceMessage(character.name, beatmap, perfect), 
		perfect ? '#c794ff' : '#fa81c6',
	);
};

/** Server-announce a new #1 in chat (a "perfect" variant for a max score). */
const announceBillions = async (score: ScoreRow, rankedScore: number) => {
	const character = await getCharacterById(score.characterId);
	if (!character) return;

	const billions = Math.floor(rankedScore / 1_000_000_000) * 1_000_000_000;
	announce(
		ANNOUNCE_CHANNEL, 
		billionsMessage(character.name, billions), 
		'#81e2fa',
	);
};

/** Server-announce a new #1 in chat (a "perfect" variant for a max score). */
const announcePps = async (profile: ProfileRow) => {
	const character = await getCharacterById(profile.id);
	if (!character) return;
	const pps = Math.floor(Number(profile.pp) / 1_000) * 1_000;
	announce(
		ANNOUNCE_CHANNEL, 
		ppsMessage(character.name, pps), 
		'#fa9981',
	);
};

/** Highest announceable level in (from, to], if any was crossed. */
const highestMilestone = (from: number, to: number) => {
	for (let level = to; level > from; level--) {
		if (isSkillLevelMilestone(level)) return level;
	}
};

/** Server-announce newly crossed skill level milestones in chat. Announced at
 *  most once per character ever (tracked in `skill_milestone`), so a level
 *  reset then re-climb stays silent. */
const announceSkillLevels = async (
	ruleset: ServerRuleset,
	characterId: number,
	levels: { skill: string; from: number; to: number }[],
) => {
	const reached = levels.flatMap(({ skill, from, to }) => {
		const level = highestMilestone(from, to);
		return level === undefined ? [] : [{
			skill, level, 
		}];
	});
	if (!reached.length) return;

	const character = await getCharacterById(characterId);
	if (!character) return;
	const announced = await getSkillMilestones(ruleset, characterId);
	for (const { skill, level } of reached) {
		if (level <= (announced.get(skill) ?? 0)) continue;
		await setSkillMilestone(ruleset, characterId, skill, level);
		announce(
			ANNOUNCE_CHANNEL,
			skillLevelMessage(character.name, ruleset.def.skillName(skill), level),
			'#81fa9b',
		);
	}
};

/** Apply per-skill XP gains to a character's profile in a ruleset, on the shared levelling
 *  curve. Returns the per-skill before/after progression for the result screen. */
export async function applySkillXp(
	ruleset: ServerRuleset,
	characterId: number,
	xp: Readonly<Record<string, number>>,
	/** Off when catching xp up after a rollback: those milestones were announced
	 *  when they were first reached, and the channel should not hear them twice. */
	announceMilestones = true,
) {
	const { def, profile } = ruleset;
	await profileOf(ruleset, characterId);
	// The read and the write are one locked transaction: this writes back levels
	// and totals it read at the start, so a purchase committing in between would
	// be silently reverted - the spent levels handed back while the upgrade it
	// bought stays (`${skill}Upgrades` isn't in the update set).
	const { row, gains } = await db.transaction(async tx => {
		const [row] = await tx
			.select()
			.from(profile)
			.where(eq(profile.id, characterId))
			.limit(1)
			.for('update');
		if (!row) throw new Error(`character ${characterId} not found`);

		let overallXpGained = 0;
		const gains = def.skills.map(skill => {
			const { level: fromLevel, xp: fromXp } = skillOf(row, skill);
			const gained = xp[skill] ?? 0;
			overallXpGained += gained;
			const to = gainLevels(fromLevel, fromXp, gained);
			return {
				skill,
				gained,
				fromLevel,
				fromXp,
				toLevel: to.level,
				toXp: Math.round(to.xp),
				levels: to.levels,
				xp: gained,
			};
		});

		const overall = gainLevels(row.overallLevel, row.overallXp, overallXpGained);

		const updates = Object.assign({}, ...gains.map(g => {
			const was = skillOf(row, g.skill);
			return skillColumnsFor(g.skill, {
				level: g.toLevel,
				xp: g.toXp,
				totalXp: was.totalXp + g.xp,
				lifetimeXp: was.lifetimeXp + g.xp,
			});
		}), {
			overallLevel: overall.level,
			overallXp: overall.xp,
			overallTotalXp: row.overallTotalXp + overallXpGained,
			overallLifetimeXp: row.overallLifetimeXp + overallXpGained,
		}) as Partial<ProfileRow>;

		await tx.update(profile).set(updates).where(eq(profile.id, characterId));
		return {
			row, gains,
		};
	});

	// Discord I/O never holds the row lock. The levels announced are the ones shown.
	if (announceMilestones) await announceSkillLevels(ruleset, characterId, [
		...gains.map(g => {
			const was = skillOf(row, g.skill);
			return {
				skill: g.skill,
				from: Math.floor(playLevelOf(was.level, was.xp, was.lifetimeXp, was.prestige)),
				to: Math.floor(playLevelOf(g.toLevel, g.toXp, was.lifetimeXp + g.xp, was.prestige)),
			};
		}),
		{
			skill: 'overall',
			from: xpGivesLevel(row.overallLifetimeXp).level,
			to: xpGivesLevel(row.overallLifetimeXp + gains.reduce((sum, g) => sum + g.xp, 0)).level,
		},
	]);
	return gains;
}

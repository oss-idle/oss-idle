/**
 * Replay the scores a rollback left behind.
 *
 * Restoring a pre-release snapshot takes the players' progression back with it.
 * The scores themselves were dumped first, so this walks them in the order they
 * were set and rebuilds what followed from each one.
 *
 * A score row records its outcome but not the xp it paid, and xp cannot be
 * derived from the outcome - `getSkillsXP` reads the per-note blame that only a
 * simulation produces. So each score is simulated on its own map, at the levels
 * the character held by then, purely to get that blame: **the simulated outcome
 * is thrown away**. The stored row is what gets inserted, and what the xp
 * factors read for grade and misses.
 *
 * Sequential on purpose. Every play moves the levels the next one earns at, and
 * mindblock reads the plays already inserted and fatigue the ones applied, so
 * the order is the point.
 *
 * Mania 4K only: the dump is 4K's score table, its judgement columns included.
 *
 *   npm -w @oss-idle/server run replay:scores -- --file backups/scores.json --dry-run
 */
import { readFileSync } from 'node:fs';

import { i18n } from '@lingui/core';
import { eq } from 'drizzle-orm';
import { BeatmapDecoder } from 'osu-parsers';

import {
	fatigueLevel,
	restedFatigue,
	warmup,
} from '@oss-idle/shared/fatigue';
import { parseMods } from '@oss-idle/shared/mods';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';

import { getBeatmap } from '../beatmaps';
import { addFatigue } from '../fatigue';
import {
	botFor,
	getServerXP,
} from '../rulesets/mania/4k/play';
import { STRAINED_4K } from '../rulesets/mania/4k/simState';
import { playStrain } from '../rulesets/mania/xpRules';
import {
	loadRulesets,
	rulesetFor,
} from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';
import {
	applySkillXp,
	onSubmitScore,
} from '../scores';
import { loadSim } from '../sim';
import { db } from './client';
import { addBeatmapPlayed } from './schema/beatmaps_played';
import {
	profileOf,
	skillOf,
} from './schema/character';
import type { NewScoreRow } from './schema/score';

const decoder = new BeatmapDecoder();
let r: ServerRuleset;

const arg = (name: string): string | undefined => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : process.argv[i + 1];
};
const dryRun = process.argv.includes('--dry-run');
const file = arg('file') ?? 'backups/scores-after-snapshot-153110.json';

/** A dumped row: mysql --batch gives every column back as a string. */
type DumpedScore = Record<string, string | null>;

/** The stored outcome, in the shape the xp factors read it. */
const asScoreLike = (row: DumpedScore) => ({
	score: Number(row.score),
	accuracy: Number(row.accuracy),
	grade: row.grade as never,
	MISS: Number(row.miss ?? 0),
	pfc: row.pfc === '1',
});

const toDraft = (row: DumpedScore): NewScoreRow => ({
	id: Number(row.id),
	characterId: Number(row.character_id),
	beatmapId: Number(row.beatmap_id),
	score: Number(row.score),
	accuracy: row.accuracy!,
	maxCombo: Number(row.max_combo),
	MARVELOUS: Number(row.marvelous), PERFECT: Number(row.perfect),
	GREAT: Number(row.great), GOOD: Number(row.good),
	BAD: Number(row.bad), MISS: Number(row.miss),
	DIVINE: Number(row.divine ?? 0),
	grade: row.grade as never,
	pp: row.pp!,
	ur: row.ur!,
	pfc: row.pfc === '1',
	playedAt: new Date(row.played_at!),
	mods: row.mods ?? '',
} as NewScoreRow);

/** Simulate the map at the character's current level, only to get the blame the
 *  xp split is built from. The play's own score never leaves this function. */
const xpFor = async (row: DumpedScore) => {
	const characterId = Number(row.character_id);
	const beatmapId = Number(row.beatmap_id);

	const profile = await profileOf(r, characterId);

	const beatmap = await getBeatmap(beatmapId);
	if (!beatmap?.chart) return undefined;

	const at = new Date(row.played_at!).getTime();
	const tired = restedFatigue(profile.fatigue ?? undefined, at);
	const fatigue = fatigueLevel(tired);
	const warm = warmup(tired, skillOf(profile, 'stamina').upgrades);
	const bot = await botFor(r, profile, beatmapId, fatigue, warm);
	const chart = decoder.decodeFromString(beatmap.chart);
	const rate = Number(row.rate ?? 1);
	const game = new ManiaGame(chart, bot, {
		divine: hasUnlock(profile.generation, 'DIVINE'), rate,
	});
	game.update(game.songEndMs + 1000); // straight to the end: only the blame matters

	const xp = await getServerXP(
		r, characterId, beatmapId, bot, chart, asScoreLike(row) as never, rate,
		Number(row.sr ?? beatmap.sr), parseMods(row.mods ?? ''), fatigue,
	);
	return {
		xp,
		minutes: chart.totalLength / rate / 60_000,
		strain: playStrain(STRAINED_4K, bot, chart.totalLength / rate),
		at,
	};
};

const main = async () => {
	// nothing here serves a request, so there is no request-scoped i18n to
	// borrow: any translated string would otherwise throw
	i18n.loadAndActivate({
		locale: 'en', messages: {},
	});
	await loadRulesets();
	await loadSim();
	r = rulesetFor('mania4k');

	const rows = JSON.parse(readFileSync(file, 'utf8')) as DumpedScore[];
	console.log(`replaying ${rows.length} scores from ${file}${dryRun ? ' (dry run)' : ''}`);

	const totals = new Map<number, Record<SkillName, number>>();
	let done = 0, skipped = 0;

	for (const row of rows) {
		const replayed = await xpFor(row);
		if (!replayed) {
			skipped++;
			console.warn(`  skipped score ${row.id}: no character or no chart`);
			continue;
		}

		const {
			xp, minutes, strain, at,
		} = replayed;
		const characterId = Number(row.character_id);
		const seen = totals.get(characterId)
			?? Object.fromEntries(Skills.map(s => [s, 0])) as Record<SkillName, number>;
		for (const s of Skills) seen[s] += xp[s];
		totals.set(characterId, seen);

		if (!dryRun) {
			// milestones were announced the first time round: silent here
			await applySkillXp(r, characterId, xp, false);
			await addFatigue(r, characterId, minutes, strain, at);
			// the original row, not the simulated one
			await addBeatmapPlayed(r, characterId, Number(row.beatmap_id));
			await db.insert(r.score).values(toDraft(row));
			const stored = (await db.select().from(r.score)
				.where(eq(r.score.id, Number(row.id))).limit(1))[0];
			if (stored) await onSubmitScore(r, stored);
		}

		if (++done % 100 === 0) console.log(`  ${done}/${rows.length}`);
	}

	console.log(`\ndone: ${done} replayed, ${skipped} skipped`);
	for (const [characterId, xp] of totals) {
		const sum = Skills.reduce((n, s) => n + xp[s], 0);
		console.log(`  character ${characterId}: ${sum.toLocaleString()} xp`);
	}
	process.exit(0);
};

void main();

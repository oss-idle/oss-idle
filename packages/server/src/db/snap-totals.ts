/**
 * Set every held total once, the way upgrades, prestige and refunds now write them:
 * a skill's total is what its level and the xp inside it are worth, the overall
 * total their sum, and the overall level and xp what that total gives. Run once,
 * after 0132. Also sets every medal progress rank_score to rankScore(value): 0132's SQL
 * backfill differs from it in the last bit on about 1% of rows.
 *
 *   npm -w @oss-idle/server run snap:totals:prod -- --dry-run [--ruleset mania4k]
 *
 * Every enabled ruleset unless --ruleset names one.
 */
import {
	and,
	eq,
} from 'drizzle-orm';

import {
	Big,
	toText,
	ZERO,
} from '@oss-idle/shared/big';
import { rankScore } from '@oss-idle/shared/rankings';
import {
	heldTotal,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import { reindexCharacter } from '../rankings';
import {
	enabledRulesets,
	loadRulesets,
	rulesetFromArgs,
} from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';
import { db } from './client';
import {
	characters,
	skillColumnsFor,
	skillOf,
} from './schema/character';

const dryRun = process.argv.includes('--dry-run');

const snapRankScores = async (r: ServerRuleset): Promise<string> => {
	const p = r.progress;
	const rows = await db.select().from(p);
	let changed = 0;
	for (const row of rows) {
		const score = rankScore(Big.from(row.value));
		if (score === row.rankScore) continue;
		changed++;
		if (!dryRun) {
			await db.update(p).set({ rankScore: score })
				.where(and(eq(p.characterId, row.characterId), eq(p.line, row.line)));
		}
	}
	return `${changed} of ${rows.length} progress rank scores ${dryRun ? 'would be' : 'were'} set`;
};

const snapTotals = async (r: ServerRuleset) => {
	const { profile } = r;
	const ids = (await db.select({ id: profile.id }).from(profile)).map(row => row.id);
	console.log(`${r.def.id}: checking ${ids.length} characters${dryRun ? ' (dry run)' : ''}`);

	let changed = 0;
	let moved = 0;
	for (const id of ids) {
		const move = await db.transaction(async tx => {
			const [{ name, row }] = await tx.select({
				name: characters.name, row: profile,
			})
				.from(profile)
				.innerJoin(characters, eq(characters.id, profile.id))
				.where(eq(profile.id, id))
				.for('update');
			const totals = r.def.skills.map(s => {
				const { level, xp } = skillOf(row, s);
				return heldTotal(level, xp);
			});
			const overallTotalXp = totals.reduce((sum, t) => sum.add(t), ZERO);
			const overall = xpGivesLevel(overallTotalXp);
			const same = overallTotalXp.eq(row.overallTotalXp)
				&& overall.xp.eq(row.overallXp)
				&& overall.level === row.overallLevel
				&& r.def.skills.every((s, i) => totals[i].eq(skillOf(row, s).totalXp));
			if (same) return undefined;
			changed++;
			if (!dryRun) {
				await tx.update(profile).set({
					...Object.assign({}, ...r.def.skills.map((s, i) =>
						skillColumnsFor(s, { totalXp: totals[i] }))),
					overallTotalXp,
					overallLevel: overall.level,
					overallXp: overall.xp,
				}).where(eq(profile.id, id));
			}
			if (overall.level === row.overallLevel) return undefined;
			return `  ${name} (${id}): Lv${row.overallLevel} -> Lv${overall.level}`
				+ `  (${toText(row.overallTotalXp)} -> ${toText(overallTotalXp)} xp)`;
		});
		if (!move) continue;
		moved++;
		console.log(move);
		if (!dryRun) await reindexCharacter(r, id);
	}

	console.log(`\n${changed} of ${ids.length} characters ${dryRun ? 'would get' : 'got'} new totals;`
		+ ` ${moved} overall level${moved === 1 ? '' : 's'} ${dryRun ? 'would move' : 'moved'}`);
	console.log(await snapRankScores(r));
};

const main = async () => {
	await loadRulesets();
	const rulesets = process.argv.includes('--ruleset') ? [rulesetFromArgs()] : enabledRulesets();
	for (const r of rulesets) await snapTotals(r);
	process.exit(0);
};

void main();

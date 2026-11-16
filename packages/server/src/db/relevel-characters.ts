/**
 * Read every character's levels back off the XP it has kept.
 *
 * Run this after any change to the XP curve. The level curve is tuned between
 * releases - most recently the endgame tier past 100, which used to cost a flat
 * 10M per level and now grows by 10M each level - and a stored level is only
 * ever the old prices' answer. The XP itself means the same under any curve.
 *
 * So this reads `${skill}TotalXp` and writes back the level and the progress
 * inside it, one direction, never the other way round: nothing here creates,
 * destroys or moves XP.
 *
 * A total of 0 under a level above it is a row that predates the backfill, not
 * a character with nothing: deriving from it would erase the level. Those are
 * reported and left alone - run `snap:totals` first, which is what puts the
 * totals back in step with the levels.
 *
 *   npm -w @oss-idle/server run relevel:prod -- --dry-run [--ruleset mania4k]
 */
import { eq } from 'drizzle-orm';

import { xpGivesLevel } from '@oss-idle/shared/xp';

import { reindexCharacter } from '../rankings';
import {
	loadRulesets,
	rulesetFromArgs,
} from '../rulesets/registry';
import { db } from './client';
import {
	characters,
	type ProfileRow,
	skillColumnsFor,
	skillOf,
} from './schema/character';

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
	await loadRulesets();
	const r = rulesetFromArgs();
	const rows = (await db.select({
		name: characters.name, profile: r.profile, 
	})
		.from(r.profile)
		.innerJoin(characters, eq(characters.id, r.profile.id)))
		.map(({ name, profile }) => ({
			...profile, name, 
		}));
	console.log(`checking ${rows.length} characters${dryRun ? ' (dry run)' : ''}`);

	let relevelled = 0;
	let stale = 0;
	for (const row of rows) {
		const untotalled = r.def.skills.filter(s => {
			const { totalXp, level } = skillOf(row, s);
			return totalXp.isZero() && level > 0;
		});
		if (untotalled.length) {
			console.log(`  ! ${row.name} (${row.id}): no total behind ${untotalled.join(', ')} - skipped`);
			stale++;
			continue;
		}

		const updates: Partial<ProfileRow> = {};
		const dropped: string[] = [];

		for (const skill of r.def.skills) {
			const was = skillOf(row, skill);
			const next = xpGivesLevel(was.totalXp);
			Object.assign(updates, skillColumnsFor(skill, {
				level: next.level, xp: next.xp.floor(), 
			}));
			if (next.level !== was.level) {
				dropped.push(`${skill} ${was.level}->${next.level}`);
			}
		}

		const overall = xpGivesLevel(row.overallTotalXp);
		updates.overallLevel = overall.level;
		updates.overallXp = overall.xp.floor();

		if (!dropped.length && overall.level === row.overallLevel) continue;

		console.log(
			`  ${row.name} (${row.id}): Lv${row.overallLevel} -> Lv${overall.level}`
			+ (dropped.length ? `  [${dropped.join(', ')}]` : ''),
		);

		if (!dryRun) {
			await db.update(r.profile).set(updates).where(eq(r.profile.id, row.id));
			// the skill boards rank on the level, so they have to be told
			await reindexCharacter(r, row.id);
		}
		relevelled++;
	}

	const plural = relevelled === 1 ? '' : 's';
	console.log(`\n${relevelled} character${plural} ${dryRun ? 'would be' : ''} relevelled`);
	if (stale) console.log(`${stale} skipped with no totals - run snap:totals, then this again`);
	process.exit(0);
};

void main();

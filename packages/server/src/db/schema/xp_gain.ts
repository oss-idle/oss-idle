import {
	gte,
	inArray,
	lte,
	sql,
} from 'drizzle-orm';
import {
	date,
	double,
	int,
	mysqlTable,
	primaryKey,
	smallint,
	varchar,
} from 'drizzle-orm/mysql-core';

import {
	playLevelOf,
	xpGainBand,
} from '@oss-idle/shared/xp';

import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { beatmaps } from './beatmap';
import {
	type ProfileRow,
	skillOf,
} from './character';

/** Paying plays and their raw strain XP, per day, skill and the level that skill
 *  played at: what the admin balance view averages. */
export const xpGainTable = (name: string) => mysqlTable(name as 'xp_gain', {
	day: date({ mode: 'string' }).notNull(),
	skill: varchar({ length: 32 }).notNull(),
	level: smallint().notNull(),
	plays: int().notNull(),
	xp: double().notNull(),
}, table => [
	primaryKey({ columns: [table.day, table.skill, table.level] }),
]);

/** The same per map, skill and band (xpGainBand): which maps pay which skills. */
export const xpGainMapTable = (name: string) => mysqlTable(name as 'xp_gain_map', {
	beatmapId: int('beatmap_id').notNull(),
	skill: varchar({ length: 32 }).notNull(),
	band: smallint().notNull(),
	plays: int().notNull(),
	xp: double().notNull(),
}, table => [
	primaryKey({ columns: [table.beatmapId, table.skill, table.band] }),
]);

export type XpGain = { skill: string, level: number, xp: number };

/** A play's raw XP per skill, at the level each skill of `profile` plays at. */
export const xpGainsOf = (
	r: ServerRuleset,
	profile: ProfileRow,
	raw: Record<string, number>,
): XpGain[] => r.def.skills.map(skill => {
	const s = skillOf(profile, skill);
	return {
		skill, level: Math.floor(playLevelOf(s.level, s.xp, s.lifetimeXp, s.prestige)), xp: raw[skill] ?? 0,
	};
});

export const recordXpGains = async (
	{ xpGains, xpGainMaps }: ServerRuleset,
	beatmapId: number,
	gains: readonly XpGain[],
) => {
	if (!gains.length) return;
	await db.insert(xpGains)
		.values(gains.map(g => ({
			day: sql`CURRENT_DATE`, skill: g.skill, level: g.level, plays: 1, xp: g.xp,
		})))
		.onDuplicateKeyUpdate({
			set: {
				plays: sql`${xpGains.plays} + 1`, xp: sql`${xpGains.xp} + VALUES(${xpGains.xp})`,
			},
		});
	await db.insert(xpGainMaps)
		.values(gains.map(g => ({
			beatmapId, skill: g.skill, band: xpGainBand(g.level), plays: 1, xp: g.xp,
		})))
		.onDuplicateKeyUpdate({
			set: {
				plays: sql`${xpGainMaps.plays} + 1`, xp: sql`${xpGainMaps.xp} + VALUES(${xpGainMaps.xp})`,
			},
		});
};

/** Plays and raw XP per skill and level, from `since` (a YYYY-MM-DD day) on. */
export const xpGainTotals = ({ xpGains }: ServerRuleset, since?: string) => db
	.select({
		skill: xpGains.skill,
		level: xpGains.level,
		plays: sql<number>`CAST(SUM(${xpGains.plays}) AS UNSIGNED)`.mapWith(Number),
		xp: sql<number>`SUM(${xpGains.xp})`.mapWith(Number),
	})
	.from(xpGains)
	.where(since === undefined ? undefined : gte(xpGains.day, since))
	.groupBy(xpGains.skill, xpGains.level);

/** osu!'s weighting of a player's best scores, here over a skill's best maps. */
const WEIGHT = 0.95;

/** Each skill's pay per band (xpGainBand) on its best maps: the maps with `minPlays` or
 *  more there, ranked by XP per play, weighted 1, 0.95, 0.95², … over the `top` best, and
 *  the three best themselves. */
export const xpGainBest = async (
	{ xpGainMaps: t }: ServerRuleset,
	minPlays: number,
	top: number,
) => {
	const perPlay = sql<number>`${t.xp} / ${t.plays}`;
	const ranked = db
		.select({
			skill: t.skill,
			band: t.band,
			beatmapId: t.beatmapId,
			plays: t.plays,
			perPlay: perPlay.mapWith(Number).as('per_play'),
			rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${t.skill}, ${t.band} ORDER BY ${perPlay} DESC)`
				.mapWith(Number).as('rank'),
		})
		.from(t)
		.where(gte(t.plays, minPlays))
		.as('ranked');
	const rows = await db.select().from(ranked).where(lte(ranked.rank, top));
	const ids = [...new Set(rows.filter(r => r.rank <= 3).map(r => r.beatmapId))];
	const names = ids.length ? await db
		.select({
			id: beatmaps.id,
			setId: beatmaps.setId,
			artist: beatmaps.artist,
			title: beatmaps.title,
			version: beatmaps.version,
		})
		.from(beatmaps)
		.where(inArray(beatmaps.id, ids)) : [];
	const byId = new Map(names.map(n => [n.id, n]));
	const cells = new Map<string, typeof rows>();
	for (const row of rows) {
		const key = `${row.skill}:${row.band}`;
		cells.set(key, [...cells.get(key) ?? [], row]);
	}
	return [...cells.values()].map(maps => {
		const best = maps.toSorted((a, b) => a.rank - b.rank);
		let sum = 0;
		let weights = 0;
		best.forEach((m, i) => {
			sum += m.perPlay * WEIGHT ** i;
			weights += WEIGHT ** i;
		});
		return {
			skill: best[0].skill,
			band: best[0].band,
			perPlay: sum / weights,
			maps: best.length,
			top: best.slice(0, 3).map(m => ({
				...byId.get(m.beatmapId), id: m.beatmapId, perPlay: m.perPlay, plays: m.plays,
			})),
		};
	});
};

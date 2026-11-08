import {
	and,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	ne,
	type SQL,
	sql,
} from 'drizzle-orm';
import {
	double,
	int,
	mysqlTable,
	primaryKey,
	timestamp,
} from 'drizzle-orm/mysql-core';

import {
	effectOf,
	readGenetics,
} from '@oss-idle/shared/genetics';
import {
	DAILY_DECAY,
	DAY_MS,
} from '@oss-idle/shared/rulesets/mania/memoryRecall';

import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { profilePage } from '../profilePage';
import {
	beatmapListColumns,
	beatmaps,
} from './beatmap';
import {
	beatmapset,
	setColumns,
} from './beatmapset';
import { characters } from './character';


export const playedTable = (name: string) => mysqlTable(name as 'beatmaps_played', {
	characterId: int().notNull()
		.references(() => characters.id, { onDelete: 'cascade' }),
	beatmapId: int().notNull()
		.references(() => beatmaps.id, { onDelete: 'cascade' }),
	plays: int().notNull().default(0),
	// plays that still train memory as of memoryAt, fading by DAILY_DECAY a day;
	// declared first so an update decays it before moving memoryAt
	memory: double().notNull().default(0),
	// the same with the character's genes counted in: what the play remembers
	recall: double().notNull().default(0),
	memoryAt: timestamp().notNull().defaultNow(),
}, table => [
	primaryKey({ columns: [table.characterId, table.beatmapId] }),
]);

export type PlayedTable = ReturnType<typeof playedTable>;
export type BeatmapsPlayedRow = PlayedTable['$inferSelect'];

const fadeSince = (played: PlayedTable, decay: number) => sql`POW(
	${1 - decay}, TIMESTAMPDIFF(SECOND, ${played.memoryAt}, NOW()) / ${DAY_MS / 1000}
)`;

/** The memory plays left now, after the fade since memoryAt. */
const memoryNow = (played: PlayedTable) =>
	sql<number>`${played.memory} * ${fadeSince(played, DAILY_DECAY)}`;

/** What the memory genes do, from the character's genetics. */
type MemoryGenes = {
	fade: number,
	favorites: number[],
	failShare: number,
	setShare: number,
	mapperRate: number,
	keep: number,
};

const memoryGenes = async (r: ServerRuleset, characterId: number): Promise<MemoryGenes> => {
	const def = r.def.genetics;
	const [profile] = def ? await db.select({ genetics: r.profile.genetics }).from(r.profile)
		.where(eq(r.profile.id, characterId)).limit(1) : [];
	const g = readGenetics(profile?.genetics);
	const of = (effect: Parameters<typeof effectOf>[2]) => (def ? effectOf(def, g, effect) : 0);
	const favorites = Math.ceil(of('favorites'));
	return {
		fade: of('fade'),
		favorites: favorites ? await mostPlayedIds(r, characterId, favorites) : [],
		failShare: of('failShare'),
		setShare: of('setShare'),
		mapperRate: of('mapperRate'),
		keep: of('keep'),
	};
};

const mostPlayedIds = async ({ played }: ServerRuleset, characterId: number, n: number) =>
	(await db.select({ id: played.beatmapId }).from(played)
		.where(and(eq(played.characterId, characterId), gt(played.plays, 0)))
		.orderBy(desc(played.plays)).limit(n)).map(row => row.id);

/** The recall left now: slower to fade with the genes, not at all on the favorites. */
const recallNow = (played: PlayedTable, genes: MemoryGenes): SQL<number> => {
	const faded = sql`${played.recall} * ${fadeSince(played, DAILY_DECAY * (1 - genes.fade))}`;
	return genes.favorites.length
		? sql<number>`CASE WHEN ${inArray(played.beatmapId, genes.favorites)} THEN ${played.recall} ELSE ${faded} END`
		: sql<number>`${faded}`;
};


export const getMostPlayed = (
	r: ServerRuleset,
	characterId: number,
	page: number = 1,
) =>
	profilePage(page, (offset, limit) => db
		.select({
			beatmaps_played: r.played, beatmap: beatmapListColumns, beatmapset: setColumns(r),
		})
		.from(r.played)
		.innerJoin(beatmaps, eq(beatmaps.id, r.played.beatmapId))
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.innerJoin(r.setStatus, eq(r.setStatus.setId, beatmapset.id))
		.where(and(eq(r.played.characterId, characterId), gt(r.played.plays, 0)))
		.orderBy(desc(r.played.plays))
		.offset(offset)
		.limit(limit));

export const getTotalPlayed = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
) => {
	return (await db
		.select({
			characterId: beatmaps_played.characterId,
			maps: count(),
		})
		.from(beatmaps_played)
		.where(and(eq(beatmaps_played.characterId, characterId), gt(beatmaps_played.plays, 0)))
		.groupBy(beatmaps_played.characterId))[0]?.maps ?? 0;
};

/** A character's plays per UTC month, oldest first, sparse. DATE_FORMAT keeps the
 *  month a string; a bare DATE() comes back as a JS Date and loses the calendar day. */
export const getPlayCounts = ({ score }: ServerRuleset, characterId: number) => {
	const month = sql<string>`DATE_FORMAT(${score.playedAt}, '%Y-%m')`;
	return db
		.select({
			d: month,
			plays: count(),
		})
		.from(score)
		.where(and(
			eq(score.characterId, characterId),
			isNotNull(score.playedAt),
		))
		.groupBy(month)
		.orderBy(month);
};

/** The plays of this map that still train memory (0 if never played): read
 *  before a play to drive the memory skill. */
export const getPlays = async (
	{ played: beatmaps_played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<number> => {
	const row = (await db
		.select({ plays: memoryNow(beatmaps_played).mapWith(Number) })
		.from(beatmaps_played)
		.where(
			and(
				eq(beatmaps_played.characterId, characterId), 
				eq(beatmaps_played.beatmapId, beatmapId),
			),
		))[0];
	return row?.plays ?? 0;
};

/** What a play of the map remembers with the genes counted in, and every time it was played. */
export const getRecall = async (
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
): Promise<{ recall: number, tries: number }> => {
	const genes = await memoryGenes(r, characterId);
	const row = (await db
		.select({
			recall: recallNow(r.played, genes).mapWith(Number), tries: r.played.plays, 
		})
		.from(r.played)
		.where(and(eq(r.played.characterId, characterId), eq(r.played.beatmapId, beatmapId))))[0];
	return {
		recall: row?.recall ?? 0, tries: row?.tries ?? 0, 
	};
};

/** Forget every map this character has learned, without touching how many times
 *  they played it. Prestiging memory trades the training in for the bonus, so
 *  the maps are fresh to it again while `plays` keeps counting for the profile. */
export const resetMemory = async (
	r: ServerRuleset,
	characterId: number,
) => {
	const genes = await memoryGenes(r, characterId);
	const beatmaps_played = r.played;
	return db
		.update(beatmaps_played)
		.set({
			memory: 0, recall: sql`${recallNow(beatmaps_played, genes)} * ${genes.keep}`, memoryAt: sql`NOW()`,
		})
		.where(eq(beatmaps_played.characterId, characterId));
};

/** A memory upgrade forgets some plays on every map, never below zero. */
export const forgetMemory = async (
	r: ServerRuleset,
	characterId: number,
	plays: number,
) => {
	const genes = await memoryGenes(r, characterId);
	const beatmaps_played = r.played;
	return db
		.update(beatmaps_played)
		.set({
			memory: sql`GREATEST(${memoryNow(beatmaps_played)} - ${plays}, 0)`,
			recall: sql`GREATEST(${recallNow(beatmaps_played, genes)} - ${plays}, 0)`,
			memoryAt: sql`NOW()`,
		})
		.where(eq(beatmaps_played.characterId, characterId));
};

export const addBeatmapPlayed = async (
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
) => {
	const genes = await memoryGenes(r, characterId);
	await db.update(beatmaps)
		.set({ plays: sql`${beatmaps.plays} + 1` })
		.where(eq(beatmaps.id, beatmapId));

	const recall = 1 + (await knowsMapper(r, characterId, beatmapId) ? genes.mapperRate : 0);
	await remember(r, characterId, beatmapId, genes, {
		plays: 1, memory: 1, recall, 
	});
	if (genes.setShare) {
		for (const sibling of await sameAudio(beatmapId)) {
			await remember(r, characterId, sibling, genes, { recall: genes.setShare });
		}
	}
};

/** Add to a map's memory and recall, after their fade. */
const remember = (
	{ played }: ServerRuleset,
	characterId: number,
	beatmapId: number,
	genes: MemoryGenes,
	add: { plays?: number, memory?: number, recall: number },
) => db
	.insert(played)
	.values({
		characterId, beatmapId, plays: add.plays ?? 0, memory: add.memory ?? 0, recall: add.recall,
	})
	.onDuplicateKeyUpdate({
		set: {
			plays: sql`${played.plays} + ${add.plays ?? 0}`,
			memory: sql`${memoryNow(played)} + ${add.memory ?? 0}`,
			recall: sql`${recallNow(played, genes)} + ${add.recall}`,
			memoryAt: sql`NOW()`,
		},
	});

/** The set's other difficulties on the same audio file. */
const sameAudio = async (beatmapId: number): Promise<number[]> => {
	const [map] = await db.select({
		setId: beatmaps.setId, audio: beatmaps.audio, 
	}).from(beatmaps)
		.where(eq(beatmaps.id, beatmapId)).limit(1);
	if (!map?.audio) return [];
	return (await db.select({ id: beatmaps.id }).from(beatmaps)
		.where(and(
			eq(beatmaps.setId, map.setId),
			eq(beatmaps.audio, map.audio),
			ne(beatmaps.id, beatmapId),
		)))
		.map(row => row.id);
};

/** Maps of a mapper count as known once this many of theirs were played that often. */
const KNOWN_MAPS = 3;
const KNOWN_PLAYS = 5;

const knowsMapper = async (r: ServerRuleset, characterId: number, beatmapId: number) => {
	const [map] = await db.select({ creator: beatmapset.creator }).from(beatmaps)
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.where(eq(beatmaps.id, beatmapId)).limit(1);
	if (!map) return false;
	const [known] = await db.select({ maps: count() }).from(r.played)
		.innerJoin(beatmaps, eq(beatmaps.id, r.played.beatmapId))
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.where(and(
			eq(r.played.characterId, characterId),
			eq(beatmapset.creator, map.creator),
			gte(r.played.plays, KNOWN_PLAYS),
		));
	return (known?.maps ?? 0) >= KNOWN_MAPS;
};

/** A failed play trains memory up to where it got: `share` of a play. Only passes
 *  count as plays, so a map only ever failed stays out of the played lists. */
export const addMemory = async (
	r: ServerRuleset,
	characterId: number,
	beatmapId: number,
	share: number,
) => {
	const genes = await memoryGenes(r, characterId);
	await remember(r, characterId, beatmapId, genes, {
		memory: share, recall: share + (1 - share) * genes.failShare,
	});
};

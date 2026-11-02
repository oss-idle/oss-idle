import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	or,
	sql,
} from 'drizzle-orm';

import {
	type EventData,
	PLAYCOUNT_MILESTONES,
} from '@oss-idle/shared/events';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { db } from './db/client';
import { profilePage } from './db/profilePage';
import { beatmaps } from './db/schema/beatmap';
import { beatmapset } from './db/schema/beatmapset';
import {
	type CharacterRow,
	getCharacterById,
} from './db/schema/character';
import { events } from './db/schema/event';
import { itchDonations } from './db/schema/itch_donation';
import { supporterOrders } from './db/schema/supporter_order';
import { getUserById } from './db/schema/user';
import { warn } from './discord/error';

type Owner = { userId: number, characterId?: number, ruleset?: RulesetId };

/** Record a profile event. Never fails what it reports on. */
// ponytail: kept forever like osu!'s; prune old `rank` rows if the table weighs
export const addEvent = async (owner: Owner, event: EventData): Promise<void> => {
	const { type, ...data } = event;
	await db.insert(events).values({
		...owner, type, data,
	}).catch((e: Error) => warn(`Event ${type} for account ${owner.userId}: ${e.message}`));
};

export const characterEvent = async (
	characterId: number, ruleset: RulesetId | undefined, event: EventData,
) => {
	const character = await getCharacterById(characterId);
	if (character) await addEvent({
		userId: character.userId, characterId, ruleset,
	}, event);
};

/** A map's news on its mapper's profile, when the mapper plays here. */
export const mapperEvent = async (
	ownerUserId: number | null, ruleset: RulesetId | undefined, event: EventData,
) => {
	if (ownerUserId && await getUserById(ownerUserId)) await addEvent({
		userId: ownerUserId, ruleset,
	}, event);
};

/** A supporter tag landed: gifted, the account's first, or once again. */
export const supporterEvent = async (userId: number, gift: boolean) => {
	const [[orders], [donations]] = await Promise.all([
		db.select({ n: count() }).from(supporterOrders).where(eq(supporterOrders.recipientId, userId)),
		db.select({ n: count() }).from(itchDonations).where(eq(itchDonations.userId, userId)),
	]);
	const type = gift ? 'userSupportGift'
		: orders.n + donations.n <= 1 ? 'userSupportFirst' : 'userSupportAgain';
	await addEvent({ userId }, { type });
};

/** A difficulty's play count just reached a milestone. */
export const playcountEvent = async (ruleset: RulesetId, beatmapId: number) => {
	const [row] = await db.select({
		plays: beatmaps.plays, ownerUserId: beatmapset.ownerUserId,
	})
		.from(beatmaps)
		.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
		.where(eq(beatmaps.id, beatmapId));
	if (row && PLAYCOUNT_MILESTONES.includes(row.plays)) {
		await mapperEvent(row.ownerUserId, ruleset, {
			type: 'beatmapPlaycount', beatmapId, count: row.plays,
		});
	}
};

/** A score reprocess took medals back: so does their news. */
export const removeMedalEvents = (characterId: number, ruleset: RulesetId, medalIds: string[]) => db
	.delete(events)
	.where(and(
		eq(events.characterId, characterId),
		eq(events.ruleset, ruleset),
		eq(events.type, 'achievement'),
		inArray(sql`json_unquote(json_extract(${events.data}, '$.medalId'))`, medalIds),
	));

const mapIdsOf = (data: object) => ({
	beatmapId: 'beatmapId' in data ? Number(data.beatmapId) : undefined,
	setId: 'setId' in data ? Number(data.setId) : undefined,
});

/** The maps events name, by id: a difficulty with its set's names, or a set. */
const mapsOf = async (rows: { data: object }[]) => {
	const ids = rows.map(r => mapIdsOf(r.data));
	const beatmapIds = [...new Set(ids.flatMap(i => i.beatmapId ?? []))];
	const setIds = [...new Set(ids.flatMap(i => i.setId ?? []))];
	const [diffs, sets] = await Promise.all([
		beatmapIds.length ? db.select({
			id: beatmaps.id, setId: beatmaps.setId, version: beatmaps.version,
			title: beatmapset.title, artist: beatmapset.artist,
		})
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.where(and(inArray(beatmaps.id, beatmapIds), isNull(beatmapset.deletedAt))) : [],
		setIds.length ? db.select({
			id: beatmapset.id, title: beatmapset.title, artist: beatmapset.artist,
		})
			.from(beatmapset)
			.where(and(inArray(beatmapset.id, setIds), isNull(beatmapset.deletedAt))) : [],
	]);
	return {
		diffs: new Map(diffs.map(d => [d.id, d])), sets: new Map(sets.map(s => [s.id, s])),
	};
};

/** osu!web's recent activity: the character's events and its account's, newest first. An
 *  event whose map is gone is left out. */
export const characterEvents = async (character: CharacterRow, page: number) => {
	const list = await profilePage(page, (offset, limit) => db
		.select()
		.from(events)
		.where(and(
			eq(events.userId, character.userId),
			or(isNull(events.characterId), eq(events.characterId, character.id)),
		))
		.orderBy(desc(events.createdAt), desc(events.id))
		.offset(offset)
		.limit(limit));
	const { diffs, sets } = await mapsOf(list.items);
	return {
		hasMore: list.hasMore,
		items: list.items.flatMap(row => {
			const { beatmapId, setId } = mapIdsOf(row.data);
			const beatmap = beatmapId === undefined ? undefined : diffs.get(beatmapId);
			const set = setId === undefined ? undefined : sets.get(setId);
			if ((beatmapId !== undefined && !beatmap) || (setId !== undefined && !set)) return [];
			return [{
				id: row.id,
				createdAt: row.createdAt,
				ruleset: row.ruleset ?? undefined,
				event: {
					...row.data, type: row.type, 
				} as EventData,
				beatmap,
				beatmapset: set,
			}];
		}),
	};
};

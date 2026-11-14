import {
	eq,
	inArray,
} from 'drizzle-orm';

import { passMs } from '@oss-idle/shared/queue';
import type {
	RosterCell,
	RosterCharacter,
} from '@oss-idle/shared/roster';
import { xpGivesLevel } from '@oss-idle/shared/xp';

import { db } from '../db/client';
import { beatmaps } from '../db/schema/beatmap';
import {
	type CharacterRow,
	characters,
} from '../db/schema/character';
import type { UserRow } from '../db/schema/user';
import { livePlay } from '../play';
import { slotQueue } from '../queue';
import { enabledRulesets } from '../rulesets/registry';
import type { ServerRuleset } from '../rulesets/ruleset';
import { slotOf } from '../slot';

type Cell = Omit<RosterCell, 'queue'> & {
	rate: number,
	queue?: NonNullable<Awaited<ReturnType<typeof slotQueue>>>,
	playing?: number,
};

/** A character in a ruleset as stored: a profile never made reads as a fresh one. */
const cellOf = async (r: ServerRuleset, row: CharacterRow, user: UserRow): Promise<Cell> => {
	const [profile] = await db.select({
		generation: r.profile.generation,
		lifetime: r.profile.overallLifetimeXp,
		rate: r.profile.playRate,
	}).from(r.profile).where(eq(r.profile.id, row.id)).limit(1);
	const slot = slotOf(row.id, r.def.id);
	const watched = row.id === user.currentCharacter && row.ruleset === r.def.id;
	return {
		generation: profile?.generation ?? 1,
		overall: xpGivesLevel(profile?.lifetime ?? 0).level,
		rate: profile?.rate ?? 1,
		queue: await slotQueue(slot, row, watched),
		playing: (await livePlay(slot))?.beatmapId,
	};
};

const mapsOf = async (ids: number[]) => new Map(ids.length ? (await db
	.select({
		id: beatmaps.id, title: beatmaps.title, length: beatmaps.total_length,
	})
	.from(beatmaps)
	.where(inArray(beatmaps.id, ids))).map(b => [b.id, b]) : []);

/** Every character of the account in every ruleset it may play, with each slot's queue. */
export const rosterOf = async (user: UserRow): Promise<RosterCharacter[]> => {
	const rows = await db.select().from(characters)
		.where(eq(characters.userId, user.id))
		.orderBy(characters.id);
	const rulesets = enabledRulesets();
	const cells = await Promise.all(rows.map(row => Promise.all(rulesets
		.filter(r => !row.rulesetLock || row.rulesetLock === r.def.id)
		.map(async r => [r.def.id, await cellOf(r, row, user)] as const))));

	const maps = await mapsOf([...new Set(cells.flat().flatMap(([, c]) => [
		...c.queue?.entries.map(e => e.beatmapId) ?? [],
		...c.playing === undefined ? [] : [c.playing],
	]))]);

	return rows.map((row, i) => ({
		id: row.id,
		name: row.name,
		cells: Object.fromEntries(cells[i]!.map(([id, c]) => [id, {
			generation: c.generation,
			overall: c.overall,
			...c.queue && {
				queue: {
					state: c.queue.state,
					title: c.playing === undefined ? undefined : maps.get(c.playing)?.title,
					maps: c.queue.entries.length,
					seconds: passMs(c.queue.entries, e =>
						(maps.get(e.beatmapId)?.length ?? 0) / (e.rate ?? c.rate)) / 1000,
				}, 
			},
		}])),
	}));
};

import {
	and,
	asc,
	eq,
	isNull,
	like,
	or,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { requireActive } from '../auth/active';
import {
	requireAdmin,
	requireModerator,
} from '../auth/admin';
import { sessionUserId } from '../auth/middleware';
import {
	nameMatches,
	shownDiffCondition,
	withStatus,
} from '../beatmaps/catalog';
import { db } from '../db/client';
import { likeEscape } from '../db/columns';
import { beatmaps } from '../db/schema/beatmap';
import { beatmapset } from '../db/schema/beatmapset';
import { characters } from '../db/schema/character';
import { users } from '../db/schema/user';
import { rulesetQuery } from '../rulesets/request';
import type { ServerRuleset } from '../rulesets/ruleset';
import {
	idParam,
	valid,
} from '../validate';

const MAX_LEVEL = 500;
const SEARCH_LIMIT = 20;

const voteBody = z.object({ level: z.number().int().min(1).max(MAX_LEVEL) });
const addBody = z.object({ beatmapId: idParam });
const mapPatch = z.object({
	disabled: z.array(z.string()).max(64).optional(),
	target: z.string().trim().max(64).optional(),
});

const splitSkills = (disabled: string) => disabled ? disabled.split(',') : [];

const diffColumns = {
	beatmapId: beatmaps.id,
	setId: beatmapset.id,
	osuId: beatmapset.osuId,
	osuCover: beatmapset.osuCover,
	background: beatmaps.background,
	artist: beatmapset.artist,
	title: beatmapset.title,
	creator: beatmapset.creator,
	version: beatmaps.version,
	sr: beatmaps.sr,
};

const listMaps = async (r: ServerRuleset, viewerId?: number) => {
	const [maps, votes] = await Promise.all([
		db.select({
			...diffColumns,
			disabled: r.levelMaps.disabled,
			target: r.levelMaps.target,
		})
			.from(r.levelMaps)
			.innerJoin(beatmaps, eq(beatmaps.id, r.levelMaps.beatmapId))
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.orderBy(asc(beatmaps.sr)),
		db.select({
			beatmapId: r.levelVotes.beatmapId,
			userId: r.levelVotes.userId,
			skill: r.levelVotes.skill,
			level: r.levelVotes.level,
		})
			.from(r.levelVotes)
			.innerJoin(r.levelMaps, eq(r.levelMaps.beatmapId, r.levelVotes.beatmapId))
			// a restricted account's votes stop counting
			.leftJoin(users, eq(users.id, r.levelVotes.userId))
			.where(isNull(users.restrictedAt)),
	]);
	return maps.map(map => {
		const disabled = splitSkills(map.disabled);
		const levels: Record<string, number[]> = {};
		const mine: Record<string, number> = {};
		for (const vote of votes) {
			if (vote.beatmapId !== map.beatmapId || disabled.includes(vote.skill)) continue;
			(levels[vote.skill] ??= []).push(vote.level);
			if (vote.userId === viewerId) mine[vote.skill] = vote.level;
		}
		return {
			...map,
			sr: Number(map.sr),
			disabled,
			levels,
			mine,
		};
	});
};

const votable = async (r: ServerRuleset, beatmapId: number, skill: string) => {
	if (!r.def.skills.includes(skill)) throw new HTTPException(404, { message: 'No such skill' });
	const [map] = await db.select({ disabled: r.levelMaps.disabled })
		.from(r.levelMaps)
		.where(eq(r.levelMaps.beatmapId, beatmapId));
	if (!map) throw new HTTPException(404, { message: 'Not a calibration map' });
	if (splitSkills(map.disabled).includes(skill)) {
		throw new HTTPException(400, { message: 'Voting is off for this skill on this map' });
	}
};

const skillParams = z.object({
	beatmapId: idParam,
	skill: z.string(),
});

/** Level calibration: players vote the skill levels each listed difficulty needs;
 *  admins pick the maps. */
export const levelVoteRoutes = new Hono()
	.get('/', async c => c.json(await listMaps(rulesetQuery(c), await sessionUserId(c))))

	// Moderation: before the player routes, which would take `votes` for a map id.
	.delete('/votes/:userId', requireModerator, async c => {
		const r = rulesetQuery(c);
		const userId = idParam.parse(c.req.param('userId'));
		await db.delete(r.levelVotes).where(eq(r.levelVotes.userId, userId));
		return c.json({ ok: true });
	})

	// Every vote on a map, restricted voters' included, with who cast it.
	.get('/:beatmapId/votes', requireModerator, async c => {
		const r = rulesetQuery(c);
		const beatmapId = idParam.parse(c.req.param('beatmapId'));
		return c.json(await db.select({
			userId: r.levelVotes.userId,
			username: users.username,
			characterId: characters.id,
			name: characters.name,
			restrictedAt: users.restrictedAt,
			skill: r.levelVotes.skill,
			level: r.levelVotes.level,
		})
			.from(r.levelVotes)
			.leftJoin(users, eq(users.id, r.levelVotes.userId))
			.leftJoin(characters, eq(characters.id, users.currentCharacter))
			.where(eq(r.levelVotes.beatmapId, beatmapId)));
	})

	.delete('/:beatmapId/votes/:userId', requireModerator, async c => {
		const r = rulesetQuery(c);
		const beatmapId = idParam.parse(c.req.param('beatmapId'));
		const userId = idParam.parse(c.req.param('userId'));
		await db.delete(r.levelVotes)
			.where(and(eq(r.levelVotes.beatmapId, beatmapId), eq(r.levelVotes.userId, userId)));
		return c.json({ ok: true });
	})

	.put(
		'/:beatmapId/:skill',
		requireActive,
		valid('param', skillParams),
		valid('json', voteBody),
		async c => {
			const r = rulesetQuery(c);
			const { beatmapId, skill } = c.req.valid('param');
			const { level } = c.req.valid('json');
			await votable(r, beatmapId, skill);
			await db.insert(r.levelVotes)
				.values({
					beatmapId, userId: c.get('userId'), skill, level,
				})
				.onDuplicateKeyUpdate({ set: { level } });
			return c.json({ ok: true });
		},
	)

	.delete('/:beatmapId/:skill', requireActive, valid('param', skillParams), async c => {
		const r = rulesetQuery(c);
		const { beatmapId, skill } = c.req.valid('param');
		await db.delete(r.levelVotes).where(and(
			eq(r.levelVotes.beatmapId, beatmapId),
			eq(r.levelVotes.userId, c.get('userId')),
			eq(r.levelVotes.skill, skill),
		));
		return c.json({ ok: true });
	})

	// Live difficulties of the ruleset or players' maps not listed yet, by set title, artist, mapper or difficulty name.
	.get('/search', requireAdmin, async c => {
		const r = rulesetQuery(c);
		const q = c.req.query('q') ?? '';
		if (q.trim().length < 2) return c.json([]);
		return c.json((await db.select(diffColumns)
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.innerJoin(...withStatus(r))
			.leftJoin(r.levelMaps, eq(r.levelMaps.beatmapId, beatmaps.id))
			.where(and(
				shownDiffCondition(r),
				or(nameMatches(q), like(beatmaps.version, `%${likeEscape(q.trim())}%`)),
				isNull(r.levelMaps.beatmapId),
			))
			.orderBy(asc(beatmapset.title), asc(beatmaps.sr))
			.limit(SEARCH_LIMIT))
			.map(row => ({
				...row, sr: Number(row.sr),
			})));
	})

	.post('/', requireAdmin, valid('json', addBody), async c => {
		const r = rulesetQuery(c);
		const { beatmapId } = c.req.valid('json');
		const [live] = await db.select({ id: beatmaps.id })
			.from(beatmaps)
			.innerJoin(beatmapset, eq(beatmapset.id, beatmaps.setId))
			.innerJoin(...withStatus(r))
			.where(and(eq(beatmaps.id, beatmapId), shownDiffCondition(r)));
		if (!live) throw new HTTPException(404, { message: 'No such difficulty' });
		await db.insert(r.levelMaps)
			.values({
				beatmapId, addedBy: c.get('userId'), disabled: r.def.skills.join(','),
			})
			.onDuplicateKeyUpdate({ set: { beatmapId } });
		return c.json({ ok: true });
	})

	.patch('/:beatmapId', requireAdmin, valid('json', mapPatch), async c => {
		const r = rulesetQuery(c);
		const beatmapId = idParam.parse(c.req.param('beatmapId'));
		const { disabled, target } = c.req.valid('json');
		if (disabled === undefined && target === undefined) return c.json({ ok: true });
		await db.update(r.levelMaps)
			.set({
				disabled: disabled?.filter(skill => r.def.skills.includes(skill)).join(','),
				target,
			})
			.where(eq(r.levelMaps.beatmapId, beatmapId));
		return c.json({ ok: true });
	})

	// The votes stay, so putting the map back brings them back.
	.delete('/:beatmapId', requireAdmin, async c => {
		const r = rulesetQuery(c);
		const beatmapId = idParam.parse(c.req.param('beatmapId'));
		await db.delete(r.levelMaps).where(eq(r.levelMaps.beatmapId, beatmapId));
		return c.json({ ok: true });
	});

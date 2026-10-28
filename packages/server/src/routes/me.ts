import {
	and,
	eq,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
	debugCharacterBody,
	debugSimBody,
} from '@oss-idle/shared/debug';
import { restedFatigue } from '@oss-idle/shared/fatigue';
import { editsCharacter } from '@oss-idle/shared/groups';
import {
	characterNameBody,
	onboardingBody,
} from '@oss-idle/shared/onboarding';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';
import type { PendingAction } from '@oss-idle/shared/pendingAction';
import {
	profileOrderBody,
	USER_PAGE_MAX,
	userPageBody,
} from '@oss-idle/shared/profile';
import { rebirthBody } from '@oss-idle/shared/rebirth';
import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';
import {
	prestigeBody,
	upgradeBody,
} from '@oss-idle/shared/upgrades';

import { requireActive } from '../auth/active';
import { requireAuth } from '../auth/middleware';
import {
	assertActionAvailable,
	assertNewestGeneration,
	performDebugCharacter,
	performPrestige,
	performRebirth,
	performUpgrade,
} from '../character/actions';
import { characterDTOOf } from '../character/dto';
import { assertNameAvailable } from '../character/names';
import {
	applyPendingAction,
	queuePendingAction,
} from '../character/pending';
import { announceCharacter } from '../character/push';
import { db } from '../db/client';
import { getPlays } from '../db/schema/beatmaps_played';
import {
	type CharacterRow,
	characters,
	currentCharacterOf,
	profileOf,
} from '../db/schema/character';
import { characterNameHistory } from '../db/schema/name_history';
import type { UserRow } from '../db/schema/user';
import { users } from '../db/schema/user';
import { publish } from '../discord/publish';
import {
	clientUrl,
	env,
} from '../env';
import { isProd } from '../env';
import { pushMedals } from '../medals';
import { count } from '../metrics';
import { isPlaying } from '../play';
import { reindexCharacter } from '../rankings';
import { rateLimit } from '../rateLimit';
import { ENABLED_RULESETS } from '../rulesets/enabled';
import {
	debugReplay,
	debugStrains,
} from '../rulesets/mania/4k/debug';
import {
	enabledRulesets,
	rulesetOfBeatmap,
	selectedRuleset,
} from '../rulesets/registry';
import {
	accountScores,
	scoreSyncState,
} from '../scoreSync';
import { isSupporter } from '../supporter';
import { saveUploadedImage } from '../uploads';
import {
	renderUserPage,
	userPageOf,
} from '../userPage';
import { valid } from '../validate';

const characterId = z.number().int().positive();
const characterRenameBody = characterNameBody.extend({ characterId: characterId.optional() });

const characterSelectBody = z.object({ characterId });

const titleBody = z.object({ medalId: z.string().max(32).optional() });

const rulesetBody = z.object({ ruleset: z.enum(RULESET_IDS) });

const previewBody = z.object({ raw: z.string().max(USER_PAGE_MAX) });
/** Which character an image goes on: the current one unless named. */
const imageQuery = z.object({ characterId: z.coerce.number().int().positive().optional() });

/** Profile customisation is a supporter perk; what was set stays up after the tag ends. */
const requireSupporter = async (userId: number) => {
	if (!await isSupporter(userId)) throw new HTTPException(403, { message: 'This needs an oss!supporter tag' });
};

/** A character whose profile the account edits, with its owner's row. */
const editableCharacter = async (userId: number, characterId: number) => {
	const [row] = await db.select().from(characters)
		.innerJoin(users, eq(users.id, characters.userId))
		.where(eq(characters.id, characterId))
		.limit(1);
	if (!row || !editsCharacter(userId, row.character)) {
		throw new HTTPException(404, { message: 'Character not found' });
	}
	return row;
};

/** The signed-in account's own character (created during first-login onboarding). */

const scoresQuery = z.object({
	ruleset: z.enum(RULESET_IDS),
	after: z.coerce.number().int().min(0).default(0),
});
export const meRoutes = new Hono()
	// The account's character, or null when onboarding is still needed.
	.get('/character', requireAuth, async c => {
		const row = await currentCharacterOf(c.get('userId'));
		return c.json(row ? await characterDTOOf(row.character, row.user) : null);
	})

	// How many plays of this map still train the current character's memory.
	.get('/memory/:beatmap', requireAuth, async c => {
		const { row } = await currentCharacter(c.get('userId'));
		const beatmapId = characterId.parse(Number(c.req.param('beatmap')));
		const r = await rulesetOfBeatmap(beatmapId);
		return c.json({ plays: r ? await getPlays(r, row.id, beatmapId) : 0 });
	})

	// Onboarding: create the account's character once, always fresh.
	.post('/character', requireAuth, async c => {
		const userId = c.get('userId');
		const body = onboardingBody.parse(await c.req.json());

		const [user] = await db.select().from(users).where(eq(users.id, userId));
		if (!user) throw new HTTPException(404, { message: 'User not found' });

		const [existing] = await db
			.select({ id: characters.id })
			.from(characters)
			.where(eq(characters.userId, userId))
			.limit(1);
		if (existing) throw new HTTPException(409, { message: 'Character already exists' });

		await assertNameAvailable(userId, body.name, user.username);

		// Always a fresh character - skill/profile columns default to zero, and
		// local Guest progress is no longer migrated online.
		const [created] = await db.insert(characters).values({
			userId, name: body.name, 
		});
		const characterId = created.insertId;

		await db.update(users)
			.set({ currentCharacter: characterId })
			.where(eq(users.id, userId));

		for (const r of enabledRulesets()) await reindexCharacter(r, characterId);

		const [row] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);

		void publish(env.USER_FEED_WEBHOOK, {
			embeds: [{
				title: `Welcome ${row.name} to oss!idle !`,
				url: `${clientUrl}/web/c/${row.id}`,
				fields: [
					{
						name: `osu! user: ${user.username}`,
						value: `(see profile)[https://osu.ppy.sh/users/${user.id}]`,
					},
				],
				thumbnail: {
					url: row.avatarUrl ?? user.avatarUrl ?? GUEST_AVATAR_URL,
					placeholder: GUEST_AVATAR_URL,
				},
			}],
		});

		count('activity', 'signups');
		return c.json(await characterDTOOf(row!, user), 201);
	})

	// Rename the account's current character (same rules as creation). The old
	// name is kept permanently in the character's name history.
	.post('/username', requireActive, valid('json', characterRenameBody), async c => {
		const userId = c.get('userId');
		const {
			name, characterId,
		} = c.req.valid('json');

		const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		const target = characterId ?? user?.currentCharacter;
		if (!user || !target) throw new HTTPException(409, { message: 'No character' });

		const { character: row, user: owner } = await editableCharacter(userId, target);

		if (name !== row.name) {
			await assertNameAvailable(userId, name, user.username, row.id);
			await db.insert(characterNameHistory).values({
				characterId: row.id, name: row.name,
			});
			await db.update(characters).set({ name }).where(eq(characters.id, row.id));
			row.name = name;
		}

		const dto = await characterDTOOf(row, owner);
		announceCharacter(dto);
		return c.json(dto);
	})

	// Upload a custom profile picture for the account's current character,
	// overriding its osu! avatar. Returns the updated character.
	.post('/avatar', requireActive, valid('query', imageQuery), async c => {
		const body = await c.req.parseBody();
		const url = await saveUploadedImage(body['file']);
		return c.json(await setCharacterImages(
			c.get('userId'), c.req.valid('query').characterId, { avatarUrl: url },
		));
	})

	// Remove the custom profile picture, reverting to the osu! avatar.
	.delete('/avatar', requireAuth, valid('query', imageQuery), async c => {
		return c.json(await setCharacterImages(
			c.get('userId'), c.req.valid('query').characterId, { avatarUrl: null },
		));
	})

	// Upload a profile banner for the account's current character.
	.post('/banner', requireActive, valid('query', imageQuery), async c => {
		const body = await c.req.parseBody();
		const url = await saveUploadedImage(body['file']);
		return c.json(await setCharacterImages(
			c.get('userId'), c.req.valid('query').characterId, { bannerUrl: url },
		));
	})

	// Remove the profile banner.
	.delete('/banner', requireAuth, valid('query', imageQuery), async c => {
		return c.json(await setCharacterImages(
			c.get('userId'), c.req.valid('query').characterId, { bannerUrl: null },
		));
	})

	// Show a held medal's name as the current character's title, or none.
	.put('/title', requireActive, valid('json', titleBody), async c => {
		const { medalId } = c.req.valid('json');
		const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1);
		const id = user?.currentCharacter;
		if (!id) throw new HTTPException(409, { message: 'No character' });
		// medal ids are unique across rulesets: any ruleset's medal can be the title
		if (medalId) {
			const held = await Promise.all(enabledRulesets().map(async ({ medals }) => (await db
				.select().from(medals)
				.where(and(eq(medals.characterId, id), eq(medals.medalId, medalId)))
				.limit(1))[0]));
			if (!held.some(Boolean)) throw new HTTPException(403, { message: 'Medal not held' });
		}
		await db.update(characters).set({ title: medalId ?? null }).where(eq(characters.id, id));
		return c.json({ title: medalId });
	})

	// Save a character's me! page (osu! BBCode); returns it rendered.
	.put('/page', requireActive, valid('json', userPageBody), async c => {
		const userId = c.get('userId');
		const { characterId, raw } = c.req.valid('json');
		await requireSupporter(userId);
		await editableCharacter(userId, characterId);
		await db.update(characters).set({ userPage: raw }).where(eq(characters.id, characterId));
		return c.json({ userPage: await userPageOf(raw) });
	})

	// Render a me! page draft without saving it.
	.post('/page/preview', requireActive, valid('json', previewBody), async c => {
		await requireSupporter(c.get('userId'));
		return c.json({ html: await renderUserPage(c.req.valid('json').raw) });
	})

	// The order of a character's profile blocks, as its owner arranged them.
	.put('/profile-order', requireActive, valid('json', profileOrderBody), async c => {
		const userId = c.get('userId');
		const { characterId, order } = c.req.valid('json');
		await requireSupporter(userId);
		await editableCharacter(userId, characterId);
		await db.update(characters).set({ profileOrder: order }).where(eq(characters.id, characterId));
		return c.json({ order });
	})

	// Buy the current character's next upgrade for a skill: spends levels
	// (and their lifetime XP, so leaderboards drop too) per the shared math.
	// Mid-play it is parked instead - see character/pending.ts.
	.post('/upgrade', requireAuth, valid('json', upgradeBody), async c => {
		const { user, row } = await currentCharacter(c.get('userId'));
		const { skill } = c.req.valid('json');

		const r = selectedRuleset(row);
		const deferred = await queueWhilePlaying(row, {
			type: 'upgrade', ruleset: r.def.id, skill, requestedAt: Date.now(),
		});
		// parked, not refused: the client spends it locally now and the server
		// does it for real when the play ends
		if (deferred !== 'none') {
			return c.json({
				queued: deferred === 'queued',
				character: await characterById(row.id, user),
			});
		}

		const { spent, ratio } = await performUpgrade(r, row.id, skill);
		return c.json({
			character: await characterById(row.id, user), spent, ratio,
		});
	})

	// Debug mode on a dev server: the fatigue as it stands now, to start from.
	.get('/debug/character', requireAuth, async c => {
		if (isProd) throw new HTTPException(404, { message: 'Not found' });
		const { row } = await currentCharacter(c.get('userId'));
		const profile = await profileOf(selectedRuleset(row), row.id);
		return c.json({ fatigueMinutes: restedFatigue(profile.fatigue ?? undefined, Date.now()) });
	})

	// Debug mode on a dev server: put skills at chosen levels, fatigue at chosen
	// minutes. Not on prod.
	.post('/debug/character', requireAuth, valid('json', debugCharacterBody), async c => {
		if (isProd) throw new HTTPException(404, { message: 'Not found' });
		const { user, row } = await currentCharacter(c.get('userId'));
		await performDebugCharacter(selectedRuleset(row), row.id, c.req.valid('json'));
		const character = await characterById(row.id, user);
		announceCharacter(character);
		return c.json({ character });
	})

	// The account's scores, for a client to rebuild its local copy of them
	.get('/scores/state', requireAuth, async c => c.json(await scoreSyncState(c.get('userId'))))
	.get(
		'/scores',
		requireAuth,
		rateLimit('me-scores', 120, c => String(c.get('userId'))),
		valid('query', scoresQuery),
		async c => {
			const { ruleset, after } = c.req.valid('query');
			const r = enabledRulesets().find(e => e.def.id === ruleset);
			if (!r) throw new HTTPException(404, { message: 'This server does not play that ruleset' });
			return c.json(await accountScores(r, c.get('userId'), after));
		},
	)

	// Debug mode on a dev server: the strain view of a 4K map with the knobs on
	// the character. Not on prod.
	.post('/debug/strains', requireAuth, valid('json', debugSimBody), async c => {
		if (isProd) throw new HTTPException(404, { message: 'Not found' });
		const { row } = await currentCharacter(c.get('userId'));
		return c.json(await debugStrains(row.id, c.req.valid('json')));
	})

	// Debug mode on a dev server: the knobs' whole no-fail replay of a 4K map, to
	// watch. Not on prod.
	.post('/debug/play', requireAuth, valid('json', debugSimBody), async c => {
		if (isProd) throw new HTTPException(404, { message: 'Not found' });
		const { row } = await currentCharacter(c.get('userId'));
		return c.json(await debugReplay(row.id, c.req.valid('json')));
	})

	// Every character the account owns, oldest generation first - the hall of fame.
	.get('/characters', requireAuth, async c => {
		const userId = c.get('userId');
		const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!user) throw new HTTPException(404, { message: 'User not found' });

		const rows = await db
			.select()
			.from(characters)
			.where(eq(characters.userId, userId))
			.orderBy(characters.id);

		return c.json(await Promise.all(rows.map(row => characterDTOOf(row, user))));
	})

	// Switch which of the account's characters is live.
	.post('/character/select', requireAuth, valid('json', characterSelectBody), async c => {
		const userId = c.get('userId');
		const { characterId } = c.req.valid('json');

		const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!user) throw new HTTPException(404, { message: 'User not found' });

		const [row] = await db
			.select()
			.from(characters)
			.where(and(eq(characters.id, characterId), eq(characters.userId, userId)))
			.limit(1);
		if (!row) throw new HTTPException(404, { message: 'Character not found' });

		if (user.currentCharacter) await assertNotPlaying(user.currentCharacter);

		await db.update(users)
			.set({ currentCharacter: characterId })
			.where(eq(users.id, userId));

		return c.json(await characterDTOOf(row, user));
	})

	// Prestige one skill: its level, xp, upgrades and overdrive go, and it keeps a
	// bonus level, an extra gear tier and a bigger multiplier. Lifetime totals and
	// the ranking metrics are deliberately left alone.
	.post('/prestige', requireAuth, valid('json', prestigeBody), async c => {
		const { user, row } = await currentCharacter(c.get('userId'));
		const { skill } = c.req.valid('json');

		const r = selectedRuleset(row);
		const deferred = await queueWhilePlaying(row, {
			type: 'prestige', ruleset: r.def.id, skill, requestedAt: Date.now(),
		});
		if (deferred === 'none') await performPrestige(r, row.id, skill);

		return c.json({
			queued: deferred === 'queued',
			character: await characterById(row.id, user),
		});
	})

	// Rebirth: the account starts a fresh character one generation up, which owns
	// one more unlock. The previous one stays playable, ranked, and keeps its
	// progress - it just gives up the name, osu!-style.
	.post('/rebirth', requireAuth, valid('json', rebirthBody), async c => {
		const { user, row } = await currentCharacter(c.get('userId'));
		const { name } = c.req.valid('json');

		// Checked here, not only inside performRebirth: parked, that check would
		// not run until the play ended, where a taken name is a 403 swallowed into
		// a log - after the player was told the rebirth would happen. Keeping your
		// own name displaces the old character instead, so it needs no check.
		if (name !== row.name) await assertNameAvailable(user.id, name, user.username);
		const r = selectedRuleset(row);
		if (!r.def.rebirth) throw new HTTPException(409, { message: 'No rebirth in this ruleset' });
		await assertNewestGeneration(r, row, (await profileOf(r, row.id)).generation);

		const deferred = await queueWhilePlaying(row, {
			type: 'rebirth', ruleset: r.def.id, name, requestedAt: Date.now(),
		});
		// nothing was created yet: the answer is the character they still have
		if (deferred === 'queued') {
			return c.json({
				queued: true, character: await characterById(row.id, user),
			});
		}
		// it already happened while we were parking it: answer with what it made,
		// or the client keeps the character the rebirth just renamed
		if (deferred === 'applied') {
			const { row: live } = await currentCharacter(user.id);
			return c.json({
				queued: false, character: await characterById(live.id, user),
			}, 201);
		}

		const created = await performRebirth(r, user, row, name);
		return c.json({
			queued: false, character: await characterById(created, user),
		}, 201);
	})

	// Pick the ruleset the character plays: song select, the profile and the level shown
	// everywhere follow it. Mods and rate may not exist in the other one, so they clear.
	.put('/ruleset', requireAuth, valid('json', rulesetBody), async c => {
		const { user, row } = await currentCharacter(c.get('userId'));
		const { ruleset } = c.req.valid('json');
		if (!ENABLED_RULESETS.includes(ruleset)) throw new HTTPException(404, { message: 'No such ruleset' });
		if (row.rulesetLock && row.rulesetLock !== ruleset) {
			throw new HTTPException(409, { message: 'This character only plays the ruleset it was reborn in' });
		}
		await assertNotPlaying(row.id);
		await db.update(characters)
			.set({
				ruleset, playMods: null, playRate: 1,
			})
			.where(eq(characters.id, row.id));
		return c.json(await characterById(row.id, user));
	})

;

/** The character row as the wire sees it, re-read so it carries whatever the
 *  request just changed, and handed to the account's devices on the way out -
 *  the player's other screens are looking at the same character. */
const characterById = async (id: number, user: UserRow) => {
	const [row] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
	const dto = await characterDTOOf(row!, user);
	announceCharacter(dto);
	void pushMedals(selectedRuleset(row!), id)
		.catch(e => console.error('[me] medals failed for', id, e));
	return dto;
};

/**
 * Park an action when a play is running, and say whether it was parked.
 *
 * The play was simulated - outcome and xp both - from this character when it
 * started, so a purchase now can never reach it. Refusing outright would make
 * these unreachable for anyone actually using the play queue, so it waits for
 * the play to end instead. It is still checked against the character now, so an
 * impossible request fails immediately rather than silently later, and they
 * stack: buying three things during one play buys three things.
 */
const queueWhilePlaying = async (
	row: CharacterRow,
	action: PendingAction,
): Promise<'queued' | 'applied' | 'none'> => {
	if (!(await isPlaying(row.id))) return 'none';
	// checked against the character as it will be - what is already parked spends
	// first - and checked inside the lock that appends, so two clicks in the same
	// breath cannot both pass
	const r = selectedRuleset(row);
	const profile = await profileOf(r, row.id);
	await queuePendingAction(row.id, action, (_locked, parked) =>
		assertActionAvailable(r, profile, action, parked));

	// The play may have finished between the check above and the append, in which
	// case its finalise has already looked for parked actions and found none.
	// Nothing else would run this one until some later play ends - so it runs
	// here, and the caller answers with what happened rather than promising it
	// for an ending that is already past.
	if (await isPlaying(row.id)) return 'queued';
	await applyPendingAction(row.id);
	return 'applied';
};

/** The account's live character, or a 409 when onboarding never ran. */
const currentCharacter = async (userId: number) => {
	const found = await currentCharacterOf(userId);
	if (!found) throw new HTTPException(409, { message: 'No character' });
	return {
		user: found.user, row: found.character,
	};
};

/** A running play reads the character mid-flight, so anything that rewrites its
 *  progression waits for the play to end. */
const assertNotPlaying = async (characterId: number) => {
	if (await isPlaying(characterId)) {
		throw new HTTPException(409, { message: 'A play is in progress' });
	}
};

/** Set the account's current character avatar or banner and return the resolved character DTO. */
const setCharacterImages = async (
	userId: number,
	requested: number | undefined,
	images: Partial<Pick<CharacterRow, 'avatarUrl' | 'bannerUrl'>>,
) => {
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	const id = requested ?? user?.currentCharacter;
	if (!id) throw new HTTPException(409, { message: 'No character' });
	const { user: owner } = await editableCharacter(userId, id);

	await db.update(characters).set(images).where(eq(characters.id, id));
	const [row] = await db
		.select()
		.from(characters)
		.where(eq(characters.id, id))
		.limit(1);
	const dto = await characterDTOOf(row!, owner);
	announceCharacter(dto);
	return dto;
};

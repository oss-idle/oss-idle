import {
	eq,
	max,
} from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { DebugCharacterBody } from '@oss-idle/shared/debug';
import type { PendingAction } from '@oss-idle/shared/pendingAction';
import {
	applyPrestige,
	applyUpgrade,
	BASE_MAX_UPGRADES,
	canPrestige,
	canRebirth,
	canUpgrade,
	maxUpgrades,
	revertUpgrade,
	type UpgradeState,
} from '@oss-idle/shared/upgrades';
import {
	xpGivesLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

import { db } from '../db/client';
import {
	type CharacterRow,
	characters,
	profileOf,
	type ProfileRow,
	skillColumnsFor,
	skillOf,
} from '../db/schema/character';
import { characterNameHistory } from '../db/schema/name_history';
import {
	type UserRow,
	users,
} from '../db/schema/user';
import { rekeyQueue } from '../queue';
import { reindexCharacter } from '../rankings';
import type { ServerRuleset } from '../rulesets/ruleset';
import { hub } from '../ws/hub';
import { rekey as presenceRekey } from '../ws/presence';
import {
	assertNameAvailable,
	displacedName,
} from './names';

/**
 * The three progression loops, as plain functions on a character's profile in a ruleset.
 *
 * They live here rather than inside their routes because a play in progress
 * defers them: the same purchase runs either from the request or, later, from
 * the play's finalise (see character/pending.ts). Two copies of this arithmetic
 * would drift.
 */

/** The character's profile in the ruleset, locked for the rest of the transaction. */
const lockProfile = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	{ profile }: ServerRuleset,
	id: number,
): Promise<ProfileRow> => {
	const [row] = await tx
		.select()
		.from(profile)
		.where(eq(profile.id, id))
		.limit(1)
		.for('update');
	if (!row) throw new HTTPException(409, { message: 'No character' });
	return row;
};

/** A skill name the ruleset has, or a 400. */
export const assertSkill = (r: ServerRuleset, skill: string): void => {
	if (!r.def.skills.includes(skill)) throw new HTTPException(400, { message: 'No such skill' });
};

const skillState = (row: ProfileRow, skill: string): UpgradeState => {
	const {
		level, xp, upgrades, overdrive, prestige,
	} = skillOf(row, skill);
	return {
		level, xp, upgrades, overdrive, prestige,
	};
};

/** Spending is global: the spent XP also leaves the lifetime totals that
 *  rankings and the overall level are built on. */
const spendTotals = (row: ProfileRow, skill: string, spent: number) => {
	const overallTotalXp = Math.max(0, row.overallTotalXp - spent);
	const overall = xpGivesLevel(overallTotalXp);
	return {
		...skillColumnsFor(skill, { totalXp: Math.max(0, skillOf(row, skill).totalXp - spent) }),
		overallTotalXp,
		overallLevel: overall.level,
		overallXp: Math.round(overall.xp),
	};
};

/**
 * A skill as it will be once everything already parked has run.
 *
 * Checking a new purchase against the character as it stands today would let
 * you buy the same upgrade twice during one play, or park a prestige you can no
 * longer afford - the first of them spends what the second needs, and only the
 * second finds out, silently, when the play ends.
 */
const projectSkill = (
	r: ServerRuleset,
	row: ProfileRow,
	parked: PendingAction[],
	skill: string,
): UpgradeState => {
	let state: UpgradeState = skillState(row, skill);
	for (const action of parked) {
		if (action.type === 'rebirth' || action.ruleset !== r.def.id || action.skill !== skill) continue;
		try {
			state = action.type === 'upgrade' ? applyUpgrade(state) : applyPrestige(state);
		} catch {
			// one that will not apply leaves the projection where it was
		}
	}
	return state;
};

/**
 * The overall level once everything already parked has run. Upgrades and
 * prestiges spend lifetime xp, and the overall level is derived from it, so a
 * rebirth checked against today's level is accepted and then refused for real
 * when its turn comes - silently, long after the player was told it would
 * happen.
 */
const projectOverallLevel = (
	r: ServerRuleset,
	row: ProfileRow,
	parked: PendingAction[],
): number => {
	let spent = 0;
	for (let i = 0; i < parked.length; i++) {
		const action = parked[i];
		if (action.type === 'rebirth' || action.ruleset !== r.def.id) continue;
		const state = projectSkill(r, row, parked.slice(0, i), action.skill);
		try {
			const next = action.type === 'upgrade' ? applyUpgrade(state) : applyPrestige(state);
			spent += Math.round(next.spent);
		} catch {
			// one that will not apply spends nothing
		}
	}
	return xpGivesLevel(Math.max(0, row.overallTotalXp - spent)).level;
};

/** The same availability check the action itself makes, run before parking one
 *  so an impossible request is refused now instead of being dropped silently
 *  when the play ends. `parked` is what is already waiting on this character. */
export const assertActionAvailable = (
	r: ServerRuleset,
	row: ProfileRow,
	action: PendingAction,
	parked: PendingAction[] = [],
): void => {
	// Everything behind a rebirth would land on a character that does not exist
	// yet - a fresh generation with no levels to spend - so it would be taken now
	// and dropped when its turn came. Refuse it at the click instead.
	if (parked.some(a => a.type === 'rebirth')) {
		throw new HTTPException(409, { message: 'A rebirth is queued: nothing else can be bought until this play ends' });
	}
	switch (action.type) {
		case 'upgrade':
			if (!canUpgrade(projectSkill(r, row, parked, action.skill))) {
				throw new HTTPException(409, { message: 'Upgrade not purchasable' });
			}
			return;
		case 'prestige':
			if (!canPrestige(projectSkill(r, row, parked, action.skill))) {
				throw new HTTPException(409, { message: 'Prestige not available' });
			}
			return;
		case 'rebirth':
			if (!canRebirth(projectOverallLevel(r, row, parked))) {
				throw new HTTPException(409, { message: 'Rebirth not available' });
			}
			return;
	}
};

/** Buy a skill's next upgrade: spend levels (and their lifetime XP, so
 *  leaderboards drop too) per the shared math. */
export const performUpgrade = async (
	r: ServerRuleset,
	characterId: number,
	skill: string,
): Promise<{ spent: number, ratio: number }> => {
	assertSkill(r, skill);
	await profileOf(r, characterId);
	const purchase = await db.transaction(async tx => {
		// Re-read under the lock applySkillXp takes. The row handed in was read
		// when the request arrived, and everything below is derived from it - a
		// play finalising in between would have its whole xp written back out of
		// that stale snapshot, since the columns it moves are not all in the
		// conditional where.
		const current = await lockProfile(tx, r, characterId);
		const state = skillState(current, skill);
		if (!canUpgrade(state)) {
			throw new HTTPException(409, { message: 'Upgrade not purchasable' });
		}
		const next = applyUpgrade(state);
		const spent = Math.round(next.spent);

		const updates: Partial<ProfileRow> = {
			...skillColumnsFor(skill, {
				level: next.level,
				xp: Math.round(next.xp),
				upgrades: next.upgrades,
				overdrive: next.overdrive,
			}),
			...spendTotals(current, skill, spent),
			// lifetime counts for the medals; prestige resets the upgrades themselves
			upgradesBought: current.upgradesBought + 1,
			laddersCompleted: current.laddersCompleted
				+ (next.upgrades === BASE_MAX_UPGRADES ? 1 : 0),
		};

		await tx.update(r.profile).set(updates).where(eq(r.profile.id, characterId));
		return {
			spent, ratio: next.ratio,
		};
	});

	await r.progression?.afterUpgrade?.(r, characterId, skill);

	await reindexCharacter(r, characterId);
	return purchase;
};

/** Debug mode, dev servers only: put skills at these real levels as if earned -
 *  their total xp the level's price, the overall level moved with it - at these
 *  prestiges (the upgrades held to the slots left), and the fatigue at these
 *  strained minutes as of now. */
export const performDebugCharacter = async (
	r: ServerRuleset,
	characterId: number,
	{ levels = {}, prestige = {}, fatigueMinutes }: DebugCharacterBody,
): Promise<void> => {
	for (const skill of [...Object.keys(levels), ...Object.keys(prestige)]) assertSkill(r, skill);
	await db.transaction(async tx => {
		const current = await lockProfile(tx, r, characterId);
		let updates: Partial<ProfileRow> = {};
		let overallTotalXp = current.overallTotalXp;
		for (const [skill, level] of Object.entries(levels)) {
			const totalXp = Math.ceil(xpToLevel(level));
			overallTotalXp = Math.max(0, overallTotalXp + totalXp - skillOf(current, skill).totalXp);
			updates = {
				// the level is the level: the sim plays it, not what the lifetime bought
				...updates, ...skillColumnsFor(skill, {
					level, xp: 0, totalXp, lifetimeXp: totalXp,
				}),
			};
		}
		for (const [skill, count] of Object.entries(prestige)) {
			updates = {
				...updates, ...skillColumnsFor(skill, {
					prestige: count, upgrades: Math.min(skillOf(current, skill).upgrades, maxUpgrades(count)),
				}),
			};
		}
		const overall = xpGivesLevel(overallTotalXp);
		await tx.update(r.profile).set({
			...updates, overallTotalXp, overallLevel: overall.level, overallXp: Math.round(overall.xp),
			...fatigueMinutes === undefined ? {} : {
				fatigue: {
					at: Date.now(), minutes: fatigueMinutes,
				},
			},
		}).where(eq(r.profile.id, characterId));
	});
	await reindexCharacter(r, characterId);
};

/** Admin: undo a skill's last upgrade, refunding its levels and their xp as
 *  they were worth at `anchor` (see revertUpgrade). The caller keeps it away
 *  from a running play. */
export const performUpgradeRevert = async (
	r: ServerRuleset,
	characterId: number,
	skill: string,
	anchor?: number,
): Promise<void> => {
	assertSkill(r, skill);
	// same lock, same reason as performUpgrade
	await db.transaction(async tx => {
		const current = await lockProfile(tx, r, characterId);
		const state = skillState(current, skill);
		if (state.upgrades === 0) {
			throw new HTTPException(409, { message: 'No upgrade to roll back' });
		}
		if (anchor !== undefined && anchor > state.level) {
			throw new HTTPException(400, { message: 'Anchor is above the current level' });
		}
		const prev = revertUpgrade(state, anchor);

		const updates: Partial<ProfileRow> = {
			...skillColumnsFor(skill, {
				level: prev.level,
				xp: Math.round(prev.xp),
				upgrades: prev.upgrades,
				overdrive: prev.overdrive,
			}),
			...spendTotals(current, skill, -Math.round(prev.refund)),
			upgradesBought: Math.max(0, current.upgradesBought - 1),
			laddersCompleted: Math.max(0, current.laddersCompleted
				- (state.upgrades === BASE_MAX_UPGRADES ? 1 : 0)),
		};

		await tx.update(r.profile).set(updates).where(eq(r.profile.id, characterId));
	});

	await reindexCharacter(r, characterId);
};

/** Prestige one skill: its level, xp, upgrades and overdrive go, and it keeps a
 *  bonus level, an extra gear tier and a bigger multiplier. Lifetime totals and
 *  the ranking metrics are deliberately left alone. */
export const performPrestige = async (
	r: ServerRuleset,
	characterId: number,
	skill: string,
): Promise<void> => {
	assertSkill(r, skill);
	await profileOf(r, characterId);
	// same lock, same reason as performUpgrade
	await db.transaction(async tx => {
		const current = await lockProfile(tx, r, characterId);
		const state = skillState(current, skill);
		if (!canPrestige(state)) {
			throw new HTTPException(409, { message: 'Prestige not available' });
		}
		const next = applyPrestige(state);

		// the levels it just reset stop counting toward the overall level too,
		// so prestiging everything actually walks the character back down.
		// Lifetime is deliberately left alone - the tooltip reads off it.
		const spent = Math.round(next.spent);

		const updates: Partial<ProfileRow> = {
			...skillColumnsFor(skill, {
				level: next.level,
				xp: next.xp,
				upgrades: next.upgrades,
				overdrive: next.overdrive,
				prestige: next.prestige,
			}),
			...spendTotals(current, skill, spent),
		};

		await tx.update(r.profile).set(updates).where(eq(r.profile.id, characterId));
	});

	await r.progression?.afterPrestige?.(r, characterId, skill);

	await reindexCharacter(r, characterId);
};

/** Only the newest generation rebirths: the one it left behind stays playable and ranked, but
 *  rebirthing it again would hand the account another fresh character each time. */
export const assertNewestGeneration = async (
	{ profile }: ServerRuleset,
	row: CharacterRow,
	generation: number,
	exec: Pick<typeof db, 'select'> = db,
): Promise<void> => {
	const [newest] = await exec
		.select({ generation: max(profile.generation) })
		.from(characters)
		.innerJoin(profile, eq(profile.id, characters.id))
		.where(eq(characters.userId, row.userId));
	if ((newest?.generation ?? 0) > generation) {
		throw new HTTPException(409, { message: 'This character was already reborn' });
	}
};

/** Rebirth in a ruleset: the account starts a fresh character, one generation up in
 *  that ruleset, which owns one more unlock there. The previous one stays playable,
 *  ranked, and keeps its progress - it just gives up the name, osu!-style. Returns
 *  the new id. */
export const performRebirth = async (
	r: ServerRuleset,
	user: UserRow,
	row: CharacterRow,
	name: string,
): Promise<number> => {
	const profile = await profileOf(r, row.id);
	if (!canRebirth(profile.overallLevel)) {
		throw new HTTPException(409, { message: 'Rebirth not available' });
	}
	// Keeping your name is the only thing that displaces the old character: it
	// hands the name over and takes _old, osu!-style. Any other name leaves it
	// exactly as it was.
	const inherits = name === row.name;
	const displaced = inherits ? await displacedName(row.name) : undefined;
	if (!inherits) await assertNameAvailable(user.id, name, user.username);

	// the account row is the lock: two rebirths at once would both pass the check
	const characterId = await db.transaction(async tx => {
		await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
		await assertNewestGeneration(r, row, profile.generation, tx);
		if (displaced) {
			await tx.insert(characterNameHistory).values({
				characterId: row.id, name: row.name,
			});
			await tx.update(characters).set({ name: displaced }).where(eq(characters.id, row.id));
		}
		const [created] = await tx.insert(characters).values({
			userId: user.id,
			name,
			ruleset: r.def.id,
			rulesetLock: r.def.id,
			autopilotMode: row.autopilotMode,
			autopilotDelay: row.autopilotDelay,
			playRate: row.playRate,
			playMods: row.playMods,
		});
		await tx.insert(r.profile).values({
			id: created.insertId, generation: profile.generation + 1,
		});
		await tx.update(users)
			.set({ currentCharacter: created.insertId })
			.where(eq(users.id, user.id));
		return created.insertId;
	});

	await reindexCharacter(r, row.id);
	await reindexCharacter(r, characterId);

	// The account's sockets and its roster entry were both keyed by the character
	// that just gave up its place: without moving them, everything about the new
	// one's plays reaches nobody, and the player drops off the community overlay.
	hub.rekey(row.id, characterId);
	await rekeyQueue(row.id, characterId);
	const [fresh] = await db
		.select()
		.from(characters)
		.where(eq(characters.id, characterId))
		.limit(1);
	if (fresh) {
		await presenceRekey({
			fromId: row.id, character: fresh, user,
		});
	}
	return characterId;
};

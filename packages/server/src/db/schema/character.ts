import { eq } from 'drizzle-orm';
import {
	bigint,
	boolean,
	decimal,
	double,
	int,
	mediumtext,
	mysqlTable,
	varchar,
} from 'drizzle-orm/mysql-core';

import {
	type Big,
	ZERO,
} from '@oss-idle/shared/big';
import type { CharacterDTO } from '@oss-idle/shared/character';
import type { Fatigue } from '@oss-idle/shared/fatigue';
import {
	type Genetics,
	readGenetics,
} from '@oss-idle/shared/genetics';
import type { Mod } from '@oss-idle/shared/mods';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';
import type { PendingAction } from '@oss-idle/shared/pendingAction';
import type { AutopilotMode } from '@oss-idle/shared/queue';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { RulesetDef } from '@oss-idle/shared/rulesets/ruleset';
import { xpGivesLevel } from '@oss-idle/shared/xp';

import { apiBaseUrl } from '../../env';
import type { ServerRuleset } from '../../rulesets/ruleset';
import { db } from '../client';
import { jsonColumn } from '../columns';
import { bigColumn } from './bigColumn';
import { users } from './user';

/** The profile's rank boards: global pp, country pp, score, overall, each of the ruleset's skills. */
export type RankBoard = 'pp' | 'country' | 'score' | 'overall' | (string & {});

/** Daily global pp rank samples, oldest first, capped at RANK_HISTORY_DAYS.
 *  `date` is the UTC day (YYYY-MM-DD) of the latest sample. `highest` is the
 *  best rank ever seen on each board and when (ms), recorded since 2026-10-21. */
export type RankHistory = {
	date: string;
	ranks: number[];
	highest?: Partial<Record<RankBoard, { rank: number; at: number }>>;
};

export const RANK_HISTORY_DAYS = 90;

const skillColumn = () => bigint({ mode: 'number' }).notNull().default(0);

type SkillColumns<S extends string> =
	& { [K in S as `${K}Level`]: ReturnType<typeof skillColumn> }
	& { [K in S as `${K}Xp`]: ReturnType<typeof bigColumn> }
	& { [K in S as `${K}TotalXp`]: ReturnType<typeof bigColumn> }
	& { [K in S as `${K}LifetimeXp`]: ReturnType<typeof bigColumn> }
	& { [K in S as `${K}Upgrades`]: ReturnType<typeof skillColumn> }
	& { [K in S as `${K}Prestige`]: ReturnType<typeof skillColumn> }
	& { [K in S as `${K}Overdrive`]: ReturnType<typeof bigColumn> };

const skillColumns = <S extends string>(skills: readonly S[]) => Object.fromEntries(
	skills.flatMap(skill => [
		[`${skill}Level`, skillColumn()],
		[`${skill}Xp`, bigColumn()],
		[`${skill}TotalXp`, bigColumn()],
		[`${skill}LifetimeXp`, bigColumn()],
		[`${skill}Upgrades`, skillColumn()],
		[`${skill}Prestige`, skillColumn()],
		[`${skill}Overdrive`, bigColumn()],
	]),
) as SkillColumns<S>;

/** Who the character is, in every ruleset. */
export const characters = mysqlTable('character', {
	id: int().autoincrement().primaryKey(),
	userId: int().notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: varchar({ length: 255 }).unique().notNull(),
	// A player-uploaded avatar overriding the account's osu! one. Stored as a
	// server-relative upload path (e.g. /uploads/x.png); resolved to an absolute
	// URL in characterToDTO, falling back to the osu! avatar.
	avatarUrl: varchar({ length: 512 }),
	// Profile banner upload, stored like avatarUrl.
	bannerUrl: varchar({ length: 512 }),
	/** A held medal's id, its name shown under the character's name. Medal ids
	 *  are unique across rulesets, so any ruleset's medal can be the title. */
	title: varchar({ length: 32 }),
	/** The me! page, raw osu! BBCode. */
	userPage: mediumtext(),
	/** The supporter's order for the profile blocks (`PROFILE_SECTIONS`). */
	profileOrder: jsonColumn<string[]>(),
	/** The ruleset the player picked: song select, the level shown in chat. */
	ruleset: varchar({ length: 16 }).$type<RulesetId>().notNull().default('mania4k'),
	/** A reborn character plays only the ruleset it was reborn in; null plays them all.
	 *  A play forced into another ruleset goes to the account's previous character. */
	rulesetLock: varchar({ length: 16 }).$type<RulesetId>(),
	/** The actions a running play has deferred to its end, in order. */
	pendingAction: jsonColumn<PendingAction[]>(),
});

/** A character's progress in one ruleset: nothing in it carries over to another. */
export const profileTable = <S extends string>(
	name: string,
	skills: readonly S[],
) => mysqlTable(name as 'profile', {
	id: int().primaryKey()
		.references(() => characters.id, { onDelete: 'cascade' }),
	...skillColumns(skills),
	overallLevel: skillColumn(),
	overallXp: bigColumn(),
	overallTotalXp: bigColumn(),
	overallLifetimeXp: bigColumn(),
	/** Rebirth number, 1 for a first character. Its unlock set is the first
	 *  generation - 1 entries of the shared list. */
	generation: int().notNull().default(1),
	// lifetime counts for the upgrade medals: prestige resets the upgrades themselves
	upgradesBought: int().notNull().default(0),
	laddersCompleted: int().notNull().default(0),
	pp: decimal({
		precision: 10, scale: 3,
	}).notNull().default('0'),
	rankHistory: jsonColumn<RankHistory>(),
	fatigue: jsonColumn<Fatigue>(),
	/** The play queue's preferences in this ruleset (see shared/queue.ts). */
	playRate: double().notNull().default(1),
	playMods: jsonColumn<Mod[]>(),
	autopilotMode: varchar({ length: 10 }).$type<AutopilotMode>().notNull().default('NEXT'),
	autopilotDelay: int().notNull().default(30),
	queuePlayOnce: boolean().notNull().default(false),
	genetics: jsonColumn<Genetics>(),
});

export type ProfileTable = ReturnType<typeof profileTable<never>>;
export type ProfileRow = ProfileTable['$inferSelect'];

/** One skill's columns on a profile row, by the ruleset's skill name. */
export const skillOf = (row: ProfileRow, skill: string) => {
	const r = row as unknown as Record<string, unknown>;
	return {
		level: r[`${skill}Level`] as number,
		xp: r[`${skill}Xp`] as Big,
		totalXp: r[`${skill}TotalXp`] as Big,
		lifetimeXp: r[`${skill}LifetimeXp`] as Big,
		upgrades: r[`${skill}Upgrades`] as number,
		prestige: r[`${skill}Prestige`] as number,
		overdrive: r[`${skill}Overdrive`] as Big,
	};
};
export type SkillColumnsOf = ReturnType<typeof skillOf>;

/** A profile as the web reads it: the shared columns, and each of the ruleset's skills. */
export const profileDTO = (row: ProfileRow, def: RulesetDef) => {
	return {
		pp: row.pp,
		overallLevel: row.overallLevel,
		overallXp: row.overallXp,
		overallTotalXp: row.overallTotalXp,
		overallLifetimeXp: row.overallLifetimeXp,
		generation: row.generation,
		upgradesBought: row.upgradesBought,
		laddersCompleted: row.laddersCompleted,
		skills: Object.fromEntries(def.skills.map(s => [s, skillOf(row, s)])),
	};
};

/** The profile row columns that set `state` on a skill. */
export const skillColumnsFor = (skill: string, state: Partial<SkillColumnsOf>) =>
	Object.fromEntries(Object.entries(state).map(([k, v]) =>
		[`${skill}${k[0].toUpperCase()}${k.slice(1)}`, v])) as Partial<ProfileRow>;

/** The overall total as the sum of the skills' totals, `totals` written over the row's. */
export const overallTotals = (
	r: Pick<ServerRuleset, 'def'>,
	row: ProfileRow,
	totals: Readonly<Record<string, Big>>,
) => {
	const overallTotalXp = r.def.skills.reduce(
		(sum, s) => sum.add(totals[s] ?? skillOf(row, s).totalXp),
		ZERO,
	);
	const overall = xpGivesLevel(overallTotalXp);
	return {
		overallTotalXp,
		overallLevel: overall.level,
		overallXp: overall.xp.round(),
	};
};

export type CharacterRow = typeof characters.$inferSelect;
export type NewCharacterRow = typeof characters.$inferInsert;

/**
 * The character's profile picture, always a usable absolute URL: its own upload,
 * else the account's osu! avatar, else the guest default.
 */
export const resolveAvatarUrl = (
	characterAvatarUrl: string | null,
	userAvatarUrl?: string | null,
) =>
	characterAvatarUrl ? `${apiBaseUrl}${characterAvatarUrl}` : userAvatarUrl || GUEST_AVATAR_URL;

/** The profile banner as an absolute URL, absent when none was uploaded. */
export const resolveBannerUrl = (characterBannerUrl: string | null) =>
	characterBannerUrl ? `${apiBaseUrl}${characterBannerUrl}` : undefined;

/** Map a character and its profile in a ruleset to the shared wire contract
 *  (skill columns → nested skills). */
export function characterToDTO(
	row: CharacterRow,
	profile: ProfileRow,
	def: RulesetDef,
	userAvatarUrl?: string | null,
	userCountry?: string,
): CharacterDTO {
	const skills = Object.fromEntries(def.skills.map(s => {
		const {
			level, xp, upgrades, overdrive, prestige, lifetimeXp,
		} = skillOf(profile, s);
		return [s, {
			level, xp, upgrades, overdrive, prestige, lifetimeXp,
		}];
	}));

	return {
		id: row.id,
		userId: row.userId,
		name: row.name,
		avatarUrl: resolveAvatarUrl(row.avatarUrl, userAvatarUrl),
		bannerUrl: resolveBannerUrl(row.bannerUrl),
		country: userCountry,
		ruleset: def.id,
		rulesetLock: row.rulesetLock ?? undefined,
		generation: profile.generation,
		overallLevel: xpGivesLevel(profile.overallLifetimeXp).level,
		skills,
		pendingActions: row.pendingAction ?? undefined,
		...def.genetics ? { genetics: geneticsOf(profile) } : {},
	};
}

/** A profile's genetics, empty until it picks a genetic. */
export const geneticsOf = (profile: ProfileRow): Genetics => readGenetics(profile.genetics);

/** The character's profile in a ruleset, made fresh the first time it is asked for. */
export const profileOf = async (
	{ profile }: ServerRuleset,
	characterId: number,
): Promise<ProfileRow> => {
	const read = async () =>
		(await db.select().from(profile).where(eq(profile.id, characterId)).limit(1))[0];
	const row = await read();
	if (row) return row;
	await db.insert(profile).ignore().values({ id: characterId });
	return (await read())!;
};

/** The account's current character with its user row, or undefined before onboarding. */
export const currentCharacterOf = async (userId: number) => {
	const [row] = await db
		.select()
		.from(characters)
		.innerJoin(users, eq(users.currentCharacter, characters.id))
		.where(eq(users.id, userId))
		.limit(1);
	return row;
};

export const getCharacterById = async (id: number) => {
	const [row] = await db
		.select()
		.from(characters)
		.where(eq(characters.id, id))
		.limit(1);
	return row;
};
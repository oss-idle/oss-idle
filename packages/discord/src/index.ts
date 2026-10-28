import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	Client,
	Events,
	GatewayIntentBits,
	type Guild,
	type GuildMember,
	PermissionFlagsBits,
	type Role,
} from 'discord.js';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import type { ServerMessage } from '@oss-idle/shared/community/wire';
import {
	GROUP_BADGE,
	GROUPS,
	OWNER_ID,
} from '@oss-idle/shared/groups';
import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';
import { xpGivesLevel } from '@oss-idle/shared/xp';

// One .env for the whole backend: the bot reads the server's.
config({ path: fileURLToPath(new URL('../../server/.env', import.meta.url)) });

const env = z.object({
	NODE_ENV: z.enum(['development', 'production']).default('development'),
	DISCORD_BOT_TOKEN: z.string().min(1),
	DISCORD_GUILD_ID: z.string().min(1).default('1511463564135759954'),
	DB_HOST: z.string().min(1),
	DB_PORT: z.coerce.number().int().positive().default(3306),
	DB_USER: z.string().min(1),
	DB_PASSWORD: z.string(),
	DB_NAME: z.string().min(1).default('idle'),
	DB_NAME_DEV: z.string().min(1).default('idle_test'),
	REDIS_HOST: z.string().min(1).default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().positive().default(6379),
	REDIS_PASSWORD: z.string().optional(),
	REDIS_DB: z.coerce.number().int().min(0).default(0),
}).parse(process.env);

const isProd = env.NODE_ENV === 'production';

/** The site's level colours, `.level_100` .. `.level_110` in shared.css. */
const RAMP = new Map([...readFileSync(
	fileURLToPath(new URL('../../shared/src/shared.css', import.meta.url)),
	'utf8',
).matchAll(/\.level_(\d+) \{\s*color: rgb\((\d+), (\d+), (\d+)\)/g)]
	.map(([, level, ...rgb]) => [Number(level), rgb.map(Number)]));
const RAMP_MIN = Math.min(...RAMP.keys());
const RAMP_MAX = Math.max(...RAMP.keys());
// Discord's default role colour.
const GRAY = [0x99, 0xaa, 0xb5];

/** Every 10 levels, then every level once on the site's colour ramp. */
const tierOf = (level: number) => {
	if (level >= RAMP_MIN) return level;
	if (level >= 10) return Math.floor(level / 10) * 10;
};
const roleName = (tier: number) => (tier >= RAMP_MIN ? `Level ${tier}` : `Level ${tier}+`);
const tierOfRole = (role: Role) => Number(/^Level (\d+)\+?$/.exec(role.name)?.[1]) || undefined;

/** Under the ramp: from Discord gray up to the ramp's first colour. */
const colourOf = (tier: number) => {
	const top = RAMP.get(RAMP_MIN)!;
	const rgb = tier >= RAMP_MIN
		? RAMP.get(Math.min(tier, RAMP_MAX))!
		: GRAY.map((from, i) => Math.round(from + (top[i] - from) * tier / RAMP_MIN));
	return (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
};

/** Above the ladder so their colour wins, not hoisted so the member list still reads by level.
 *  Highest first. */
const BADGES = [
	...GROUPS.map(group => ({
		key: group, ...GROUP_BADGE[group], 
	})),
	{
		key: 'supporter', name: 'Supporter', colour: '#ff66aa', 
	},
];
/** Moderation without Manage Roles, so they can't hand out Supporter or levels. Unlisted badges
 *  carry none: Discord's defaults include apps in every channel. */
const PERMISSIONS: Partial<Record<string, bigint[]>> = {
	gmt: [
		PermissionFlagsBits.KickMembers,
		PermissionFlagsBits.BanMembers,
		PermissionFlagsBits.ModerateMembers,
		PermissionFlagsBits.ManageMessages,
		PermissionFlagsBits.ManageThreads,
		PermissionFlagsBits.ManageNicknames,
		PermissionFlagsBits.MuteMembers,
		PermissionFlagsBits.DeafenMembers,
		PermissionFlagsBits.MoveMembers,
		PermissionFlagsBits.ViewAuditLog,
		PermissionFlagsBits.CreateGuildExpressions,
		PermissionFlagsBits.ManageGuildExpressions,
	],
};
const isBadge = (role: Role) => BADGES.some(badge => badge.name === role.name);

const FULL_SYNC_MS = 15 * 60 * 1000;

const db = mysql.createPool({
	host: env.DB_HOST,
	port: env.DB_PORT,
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: isProd ? env.DB_NAME : env.DB_NAME_DEV,
	connectionLimit: 2,
});

type Linked = { name?: string; level?: number; badges: string[] };

/** The current character's lifetime xp, from its ruleset's own table. */
const LIFETIME_XP = `COALESCE(${RULESET_IDS.map(id => `(SELECT p.overall_lifetime_xp FROM \`${id}_character\` p
	WHERE p.id = c.id AND c.ruleset = '${id}')`).join(', ')})`;

/** Discord id → name and overall level of the account's current character and its badge role names,
 *  for linked accounts. */
const linkedMembers = async (filter = '', args: unknown[] = []) => {
	const [rows] = await db.query<RowDataPacket[]>(
		`SELECT u.id, u.discord_id AS discordId, c.name, ${LIFETIME_XP} AS lifetimeXp,
			u.supporter_until > UTC_TIMESTAMP() AS supporter,
			(SELECT GROUP_CONCAT(g.\`group\`) FROM user_group g WHERE g.user_id = u.id) AS \`groups\`
		FROM user u LEFT JOIN \`character\` c ON c.id = u.current_character
		WHERE u.discord_id IS NOT NULL AND u.restricted_at IS NULL ${filter}`,
		args,
	);
	return new Map(rows.map(row => {
		const keys = new Set<string>(row.groups?.split(',') ?? []);
		if (row.id === OWNER_ID) keys.add('admin');
		if (row.supporter) keys.add('supporter');
		const linked: Linked = {
			name: row.name ?? undefined,
			level: row.lifetimeXp === null ? undefined : xpGivesLevel(Number(row.lifetimeXp)).level,
			badges: BADGES.filter(badge => keys.has(badge.key)).map(badge => badge.name),
		};
		return [row.discordId as string, linked];
	}));
};

/** Keep the level roles together, highest on top, so the member list reads as a ladder, and
 *  the badges right over it. */
const orderRoles = async (guild: Guild) => {
	// New roles share position 1 without lifting the rest, so the block can outgrow the bot's
	// own position. Any reorder makes Discord renumber every role.
	const lowest = guild.roles.cache.find(role => role.position === 1);
	if (lowest) await guild.roles.setPositions([{
		role: lowest, position: 1, 
	}]);
	await guild.roles.fetch();
	const ladder = [...guild.roles.cache.values()]
		.filter(role => tierOfRole(role) !== undefined)
		.sort((a, b) => tierOfRole(a)! - tierOfRole(b)!);
	const badges = [...BADGES].reverse()
		.map(badge => guild.roles.cache.find(role => role.name === badge.name))
		.filter(role => role !== undefined);
	const managed = [...ladder, ...badges];
	const base = Math.min(...managed.map(role => role.position));
	await guild.roles.setPositions(managed.map((role, i) => ({
		role, position: base + i, 
	})));
};

const creating = new Map<number, Promise<Role>>();

/** A role is made the first time someone reaches it. */
const roleFor = (guild: Guild, tier: number): Promise<Role> => {
	const existing = guild.roles.cache.find(role => role.name === roleName(tier));
	if (existing) return Promise.resolve(existing);
	let made = creating.get(tier);
	if (!made) {
		// At the foot of the block, or orderRoles would rebuild it from position 1, over any role
		// kept under the ladder.
		const position = Math.min(...guild.roles.cache
			.filter(role => tierOfRole(role) !== undefined || isBadge(role))
			.map(role => role.position));
		made = guild.roles.create({
			name: roleName(tier),
			colors: { primaryColor: colourOf(tier) },
			hoist: true,
			permissions: [],
			position,
		}).then(async role => {
			await orderRoles(guild);
			return role;
		}).finally(() => creating.delete(tier));
		creating.set(tier, made);
	}
	return made;
};

const ensureBadges = async (guild: Guild) => {
	for (const { key, name, colour } of BADGES) {
		const permissions = PERMISSIONS[key] ?? [];
		const existing = guild.roles.cache.find(role => role.name === name);
		if (!existing) await guild.roles.create({
			name, colors: { primaryColor: parseInt(colour.slice(1), 16) }, permissions,
		});
		else if (!existing.permissions.equals(permissions)) {
			// Discord only lets the bot grant what it holds: a missing one shouldn't stop the roles.
			await existing.setPermissions(permissions)
				.catch(err => console.error(`[discord] ${name} permissions:`, err.message));
		}
	}
	// Older level roles were made with Discord's default permissions, apps included.
	for (const role of guild.roles.cache.values()) {
		if (tierOfRole(role) !== undefined && role.permissions.bitfield !== 0n) {
			await role.setPermissions([]);
		}
	}
	await orderRoles(guild);
};

/** A level role nobody holds any more goes: the ladder only shows levels players are at. */
const dropEmpty = async (roles: Role[]) => {
	for (const role of roles) {
		if (tierOfRole(role) !== undefined && role.members.size === 0) await role.delete();
	}
};

const syncMember = async (member: GuildMember, linked: Linked | undefined) => {
	if (member.user.bot) return;
	const tier = linked?.level === undefined ? undefined : tierOf(linked.level);
	const want = tier === undefined ? undefined : await roleFor(member.guild, tier);
	const badges = member.guild.roles.cache.filter(role => !!linked?.badges.includes(role.name));
	const add = [want, ...badges.values()]
		.filter((role): role is Role => role !== undefined && !member.roles.cache.has(role.id));
	const stale = member.roles.cache.filter(role => tierOfRole(role) !== undefined
		? role !== want
		: isBadge(role) && !badges.has(role.id));
	// Discord never lets a bot rename the server owner or anyone ranked above it
	if (linked?.name && member.nickname !== linked.name && member.manageable) {
		await member.setNickname(linked.name)
			.catch(err => console.error(`[discord] nickname of ${member.id}:`, err.message));
	}
	if (add.length) await member.roles.add(add);
	if (stale.size) {
		await member.roles.remove(stale);
		await dropEmpty([...stale.values()]);
	}
};

const syncLinked = async (guild: Guild, linked: Map<string, Linked>) => {
	for (const [discordId, one] of linked) {
		const member = await guild.members.fetch(discordId).catch(() => undefined);
		if (member) await syncMember(member, one);
	}
};

/** Every member: also takes the role back from an account that was unlinked or relinked. */
const syncAll = async (guild: Guild) => {
	const linked = await linkedMembers();
	const members = await guild.members.fetch();
	for (const member of members.values()) await syncMember(member, linked.get(member.id));
	await dropEmpty([...guild.roles.cache.values()]);
};

/** The server pushes the character over its socket hub after every change - a
 *  play's xp, a rebirth, a fresh link - so listening there keeps roles live. */
const followCharacters = (guild: Guild) => {
	const sub = new Redis({
		host: env.REDIS_HOST,
		port: env.REDIS_PORT,
		password: env.REDIS_PASSWORD,
		db: env.REDIS_DB,
	});
	sub.on('error', err => console.error('[discord] redis:', err.message));
	void sub.subscribe(`${isProd ? 'oss-idle:prod:' : 'oss-idle:dev:'}ws:broadcast`);
	sub.on('message', (_channel, payload) => {
		const { msg } = JSON.parse(payload) as { msg?: ServerMessage };
		if (msg?.type !== 'character') return;
		void linkedMembers('AND u.id = ?', [msg.character.userId])
			.then(linked => syncLinked(guild, linked))
			.catch(err => console.error('[discord] character sync:', err));
	});
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once(Events.ClientReady, async ready => {
	const guild = await ready.guilds.fetch(env.DISCORD_GUILD_ID);
	await guild.roles.fetch();
	await ensureBadges(guild);
	followCharacters(guild);
	const fullSync = () => syncAll(guild).catch(err => console.error('[discord] full sync:', err));
	await fullSync();
	setInterval(fullSync, FULL_SYNC_MS);
	console.log(`[discord] ${ready.user.tag} managing level and badge roles on ${guild.name}`);
});

client.on(Events.GuildMemberAdd, member => {
	if (member.guild.id !== env.DISCORD_GUILD_ID) return;
	void linkedMembers('AND u.discord_id = ?', [member.id])
		.then(linked => syncMember(member, linked.get(member.id)))
		.catch(err => console.error('[discord] member join:', err));
});

await client.login(env.DISCORD_BOT_TOKEN);

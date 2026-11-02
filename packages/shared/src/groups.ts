import type { RulesetId } from './rulesets/ids.js';

/** osu!'s user groups. Admins manage the team and everything else; the Global Moderation
 *  Team applies every sanction; Beatmap Nominators rank maps in the rulesets an admin grants. */
export const GROUPS = ['admin', 'gmt', 'bn'] as const;
export type Group = typeof GROUPS[number];

/** The profile badge's short name, its hover name and the group's colour (badge, profile title). */
export const GROUP_BADGE: Record<Group, { short: string; name: string; colour: string }> = {
	admin: {
		short: 'ADM', name: 'Administrators', colour: '#b06cff',
	},
	gmt: {
		short: 'GMT', name: 'Global Moderation Team', colour: '#99eb47',
	},
	bn: {
		short: 'BN', name: 'Beatmap Nominators', colour: '#a6cc00',
	},
};

/** Adri: always an admin, and the curator of the ranked maps nobody proposed. */
export const OWNER_ID = 4579132;

/** MakiseBot's character (server migration 0095), our BanchoBot. */
export const MAKISEBOT_ID = 1;
/** MakiseBot's account: osu!'s BanchoBot id, which no one can sign in as. */
export const MAKISEBOT_USER_ID = 3;

/** Whether an account edits a character's profile: its own, and Adri MakiseBot's. */
export const editsCharacter = (
	userId: number, character: { id: number; userId: number },
): boolean =>
	character.userId === userId || (character.id === MAKISEBOT_ID && userId === OWNER_ID);

export const isAdmin = (groups?: readonly Group[]): boolean => !!groups?.includes('admin');

/** May apply sanctions and handle reports. */
export const isModerator = (groups?: readonly Group[]): boolean =>
	isAdmin(groups) || !!groups?.includes('gmt');

/** May rank maps in `ruleset`. */
export const nominatesIn = (
	user: { groups?: readonly Group[], nominates?: readonly RulesetId[] } | undefined,
	ruleset: RulesetId,
): boolean => isAdmin(user?.groups) || !!user?.nominates?.includes(ruleset);

/** May rename a character: whoever edits it, and moderators, admins' characters
 *  only by another admin. */
export const renamesCharacter = (
	viewer: { id: number; groups?: readonly Group[] },
	character: { id: number; userId: number; groups?: readonly Group[] },
): boolean =>
	editsCharacter(viewer.id, character)
	|| (isModerator(viewer.groups) && (isAdmin(viewer.groups) || !isAdmin(character.groups)));

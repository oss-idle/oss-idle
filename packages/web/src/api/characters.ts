import type { ProfileSection } from '@oss-idle/shared/profile';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	rpc,
	unwrap,
} from './client';

type Id = number | string;

/** Public: a single character by id. */
export const getCharacter = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));

/** Public: the medals a character holds, newest first, and its progress toward the rest. */
export const getCharacterMedals = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].medals.$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));

/** Public: a character's derived profile statistics. */
export const getCharacterStats = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].stats.$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));

/** The signed-in account's own character, or null when onboarding is needed. */
export const getMyCharacter = () =>
	unwrap(rpc.v1.me.character.$get());

export const getCharacterMostPlayed = (id: Id, page: Id, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].mostplayed[':page'].$get({
		param: {
			id: String(id), page: String(page), 
		},
		query: { ruleset },
	}));
export const getCharacterCountPlayed = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].countplayed.$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));
/** Public: monthly plays for the profile's Play History. */
export const getCharacterPlayCounts = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].playcounts.$get({
		param: { id: String(id) }, query: { ruleset },
	}));
	
export const getCharacterBestPP = (id: Id, page: Id, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].bestpp[':page'].$get({
		param: {
			id: String(id), page: String(page), 
		},
		query: { ruleset },
	}));
	
export const getCharacterNbFirstPlaces = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].countfirstplaces.$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));
export const getCharacterFirstPlaces = (id: Id, page: Id, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].firstplaces[':page'].$get({
		param: {
			id: String(id), page: String(page), 
		},
		query: { ruleset },
	}));
	
export const getCharacterRecent = (id: Id, page: Id, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].recent[':page'].$get({
		param: {
			id: String(id), page: String(page), 
		},
		query: { ruleset },
	}));
export const getCharacterNbRankedMaps = (id: number | string, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].countrankedmaps.$get({
		param: { id: String(id) }, query: { ruleset }, 
	}));
export const getCharacterRankedMaps = (id: Id, page: Id, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].rankedmaps[':page'].$get({
		param: {
			id: String(id), page: String(page), 
		},
		query: { ruleset },
	}));

/** The account's own maps: the ranked or loved ones they mapped, or their unranked uploads. */
export type MappedStatus = 'ranked' | 'loved' | 'unranked';
export const getCharacterNbMapped = (id: Id, status: MappedStatus, ruleset?: RulesetId) =>
	unwrap(rpc.v1.characters[':id'].countmapped[':status'].$get({
		param: {
			id: String(id), status, 
		},
		query: { ruleset },
	}));
export const getCharacterMapped = (
	id: Id,
	status: MappedStatus,
	page: number,
	ruleset?: RulesetId,
) =>
	unwrap(rpc.v1.characters[':id'].mapped[':status'][':page'].$get({
		param: {
			id: String(id), status, page: String(page), 
		},
		query: { ruleset },
	}));

/** Players whose name holds `q`. */
export const searchPlayers = (q: string) =>
	unwrap(rpc.v1.characters.search.$get({ query: { q } }));

/** Admin: undo a skill's last upgrade. */
export const rollbackUpgrade = (id: number, skill: string, anchor: number) =>
	unwrap(rpc.v1.characters[':id'].upgrade.rollback.$post({
		param: { id: String(id) }, json: {
			skill, anchor, 
		},
	}));

/** Save a character's me! page (osu! BBCode); returns it rendered, absent when blank. */
export const saveUserPage = (characterId: number, raw: string) =>
	unwrap(rpc.v1.me.page.$put({
		json: {
			characterId, raw,
		},
	}));

/** Render a me! page draft without saving it. */
export const previewUserPage = (raw: string) =>
	unwrap(rpc.v1.me.page.preview.$post({ json: { raw } }));

/** Save the order of a character's profile blocks. */
export const saveProfileOrder = (characterId: number, order: ProfileSection[]) =>
	unwrap(rpc.v1.me['profile-order'].$put({
		json: {
			characterId, order,
		},
	}));

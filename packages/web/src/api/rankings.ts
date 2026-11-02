import { GoodGrade } from '@oss-idle/shared/grade';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { SkillSort } from '../components/leaderboard/PlayerSkillLeaderboard';
import {
	rpc,
	unwrap,
} from './client';

/** Which board: `friends`, only the signed-in player and their friends; `ruleset`, the server's first when left out. */
type BoardFilter = { friends?: boolean, ruleset?: RulesetId };

const boardQuery = ({ friends, ruleset }: BoardFilter = {}) => ({
	...friends ? { friends: '1' as const } : {}, ruleset,
});

/** Countries that have at least one player, most populated first. */
export const getCountries = (ruleset?: RulesetId) =>
	unwrap(rpc.v1.ranking.countries.$get({ query: { ruleset } }));

export const getGlobalRanking = (page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.global[':page'].$get({
		param: { page: String(page) }, query: boardQuery(filter),
	}));

export const getCountryGlobalRanking = (country: string, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.global.country[':country'][':page'].$get({
		param: {
			country, page: String(page), 
		},
		query: boardQuery(filter),
	}));

export const getScoreRanking = (page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.score[':page'].$get({
		param: { page: String(page) }, query: boardQuery(filter),
	}));

export const getCountryScoreRanking = (country: string, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.score.country[':country'][':page'].$get({
		param: {
			country, page: String(page), 
		},
		query: boardQuery(filter),
	}));

export const getSkillRanking = (skill: SkillSort, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.skill[':skill'].page[':page'].$get({
		param: {
			skill, page: String(page), 
		},
		query: boardQuery(filter),
	}));

export const getCountrySkillRanking = (
	skill: SkillSort,
	country: string,
	page: number = 1,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.skill[':skill'].country[':country'].page[':page'].$get({
		param: {
			skill, page: String(page), country, 
		},
		query: boardQuery(filter),
	}));

/** The same skills ranked on what they have ever earned. */
export const getLifetimeRanking = (skill: SkillSort, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.lifetime[':skill'].page[':page'].$get({
		param: {
			skill, page: String(page),
		},
		query: boardQuery(filter),
	}));

export const getCountryLifetimeRanking = (
	skill: SkillSort,
	country: string,
	page: number = 1,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.lifetime[':skill'].country[':country'].page[':page'].$get({
		param: {
			skill, country, page: String(page),
		},
		query: boardQuery(filter),
	}));

/** How many times each skill has been prestiged. */
export const getPrestigeRanking = (skill: SkillSort, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.prestige[':skill'].page[':page'].$get({
		param: {
			skill, page: String(page),
		},
		query: boardQuery(filter),
	}));

export const getCountryPrestigeRanking = (
	skill: SkillSort,
	country: string,
	page: number = 1,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.prestige[':skill'].country[':country'].page[':page'].$get({
		param: {
			skill, country, page: String(page),
		},
		query: boardQuery(filter),
	}));

export const getGradesRanking = (
	grade: GoodGrade | 'all',
	page: number = 1,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.grades[':grade'].page[':page'].$get({
		param: {
			grade, page: String(page), 
		},
		query: boardQuery(filter),
	}));

export const getCountryGradesRanking = (
	grade: GoodGrade | 'all', 
	country: string,
	page: number = 1,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.grades[':grade'].country[':country'].page[':page'].$get({
		param: {
			grade, page: String(page), country, 
		},
		query: boardQuery(filter),
	}));

/** Countries ranked on the summed pp of their players. */
export const getCountryRanking = (page: number = 1, ruleset?: RulesetId) =>
	unwrap(rpc.v1.ranking.country[':page'].$get({
		param: { page: String(page) }, query: { ruleset },
	}));

/** The highest pp plays across every player. */
export const getTopPlays = (page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.plays[':page'].$get({
		param: { page: String(page) }, query: boardQuery(filter),
	}));

/** Medals held, each weighted by its tier. */
export const getMedalRanking = (page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.medals[':page'].$get({
		param: { page: String(page) }, query: boardQuery(filter),
	}));

export const getCountryMedalRanking = (country: string, page: number = 1, filter?: BoardFilter) =>
	unwrap(rpc.v1.ranking.medals.country[':country'][':page'].$get({
		param: {
			country, page: String(page),
		},
		query: boardQuery(filter),
	}));

/** Every medal line's top players. */
export const getProgressOverview = (ruleset?: RulesetId) =>
	unwrap(rpc.v1.ranking.progress.$get({ query: { ruleset } }));

/** The players furthest along one medal line. */
export const getProgressRanking = (
	line: string,
	page: number = 1,
	country?: string,
	filter?: BoardFilter,
) =>
	unwrap(rpc.v1.ranking.progress[':line'][':page'].$get({
		param: {
			line, page: String(page),
		},
		query: {
			...boardQuery(filter), ...country ? { country } : {},
		},
	}));

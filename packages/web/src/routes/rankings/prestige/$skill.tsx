import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import {
	getCountryPrestigeRanking,
	getPrestigeRanking,
} from '../../../api/rankings';
import { SkillSort } from '../../../components/leaderboard/PlayerSkillLeaderboard';
import SkillsRankings from '../../../pages/rankings/Skills';
import { pageCountrySearch } from '../../-rankingSearch';

export const Route = createFileRoute('/rankings/prestige/$skill')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ params, deps }) => deps.country
		? getCountryPrestigeRanking(params.skill as SkillSort, deps.country, deps.page, deps)
		: getPrestigeRanking(params.skill as SkillSort, deps.page, deps),
	component: PrestigeRoute,
	staticData: { title: msg`rankings` },
});

function PrestigeRoute() {
	const { skill } = Route.useParams();
	const { page, country } = Route.useSearch();
	return <SkillsRankings 
		skill={skill as SkillSort} 
		page={page}
		country={country} 
		players={Route.useLoaderData()}
		board='prestige'
	/>;
}

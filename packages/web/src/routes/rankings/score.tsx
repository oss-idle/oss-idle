import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import {
	getCountryScoreRanking,
	getScoreRanking,
} from '../../api/rankings';
import GlobalRankings from '../../pages/rankings/Global';
import { pageCountrySearch } from '../-rankingSearch';

export const Route = createFileRoute('/rankings/score')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => deps.country ?
		getCountryScoreRanking(deps.country, deps.page, deps) 
		: getScoreRanking(deps.page, deps),
	component: ScoreRoute,
	staticData: { title: msg`rankings` },
});

function ScoreRoute() {
	const { page, country } = Route.useSearch();
	return <GlobalRankings
		sort='rankedScore'
		page={page}
		country={country}
		players={Route.useLoaderData()}
	/>;
}

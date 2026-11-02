import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import {
	getCountryGlobalRanking,
	getGlobalRanking,
} from '../../api/rankings';
import GlobalRankings from '../../pages/rankings/Global';
import { pageCountrySearch } from '../-rankingSearch';

export const Route = createFileRoute('/rankings/global')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => deps.country ?
		getCountryGlobalRanking(deps.country, deps.page, deps) 
		: getGlobalRanking(deps.page, deps),
	component: GlobalRoute,
	staticData: { title: msg`rankings` },
});

function GlobalRoute() {
	const { page, country } = Route.useSearch();
	return <GlobalRankings sort='pp' page={page} country={country} players={Route.useLoaderData()} />;
}

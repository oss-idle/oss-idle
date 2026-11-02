import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import { getCountryRanking } from '../../api/rankings';
import CountryRankings from '../../pages/rankings/Country';
import { pageSearch } from '../-rankingSearch';

export const Route = createFileRoute('/rankings/country')({
	validateSearch: zodValidator(pageSearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => getCountryRanking(deps.page, deps.ruleset),
	component: CountryRoute,
	staticData: { title: msg`rankings` },
});

function CountryRoute() {
	const { page } = Route.useSearch();
	return <CountryRankings page={page} countries={Route.useLoaderData()} />;
}

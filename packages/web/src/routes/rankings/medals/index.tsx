import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import {
	getCountryMedalRanking,
	getMedalRanking,
} from '../../../api/rankings';
import MedalRankings from '../../../pages/rankings/Medals';
import { pageCountrySearch } from '../../-rankingSearch';

export const Route = createFileRoute('/rankings/medals/')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => deps.country ?
		getCountryMedalRanking(deps.country, deps.page, deps)
		: getMedalRanking(deps.page, deps),
	component: MedalsRoute,
	staticData: { title: msg`rankings` },
});

function MedalsRoute() {
	const { page, country } = Route.useSearch();
	return <MedalRankings page={page} country={country} players={Route.useLoaderData()} />;
}

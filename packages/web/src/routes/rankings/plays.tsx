import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import { getTopPlays } from '../../api/rankings';
import PlaysRankings from '../../pages/rankings/TopPlays';
import { pageSearch } from '../-rankingSearch';

export const Route = createFileRoute('/rankings/plays')({
	validateSearch: zodValidator(pageSearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => getTopPlays(deps.page, deps),
	component: PlaysRoute,
	staticData: { title: msg`rankings` },
});

function PlaysRoute() {
	const { page } = Route.useSearch();
	return <PlaysRankings page={page} plays={Route.useLoaderData()} />;
}

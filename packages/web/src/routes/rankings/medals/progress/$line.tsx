import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import { getProgressRanking } from '../../../../api/rankings';
import MedalProgressLine from '../../../../pages/rankings/MedalProgressLine';
import { pageCountrySearch } from '../../../-rankingSearch';

export const Route = createFileRoute('/rankings/medals/progress/$line')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ params, deps }) =>
		getProgressRanking(params.line, deps.page, deps.country, deps),
	component: LineRoute,
	staticData: { title: msg`rankings` },
});

function LineRoute() {
	const { line } = Route.useParams();
	const { page, country } = Route.useSearch();
	return <MedalProgressLine
		line={line}
		page={page}
		country={country}
		board={Route.useLoaderData()}
	/>;
}

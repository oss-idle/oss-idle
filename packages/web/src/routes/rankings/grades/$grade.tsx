import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import { GoodGrade } from '@oss-idle/shared/grade';

import {
	getCountryGradesRanking,
	getGradesRanking,
} from '../../../api/rankings';
import GradesRankings from '../../../pages/rankings/Grades';
import { pageCountrySearch } from '../../-rankingSearch';

type Grade = GoodGrade | 'all';

export const Route = createFileRoute('/rankings/grades/$grade')({
	validateSearch: zodValidator(pageCountrySearch),
	loaderDeps: ({ search }) => search,
	loader: ({ params, deps }) => deps.country
		? getCountryGradesRanking(params.grade as Grade, deps.country, deps.page, deps)
		: getGradesRanking(params.grade as Grade, deps.page, deps),
	component: GradesRoute,
	staticData: { title: msg`rankings` },
});

function GradesRoute() {
	const { grade } = Route.useParams();
	const { page, country } = Route.useSearch();
	return <GradesRankings 
		grade={grade as Grade}
		page={page}
		country={country} 
		players={Route.useLoaderData()}
	/>;
}

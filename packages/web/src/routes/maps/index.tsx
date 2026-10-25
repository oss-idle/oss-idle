import { createFileRoute } from '@tanstack/react-router';
import {
	zodValidator,
	fallback,
} from '@tanstack/zod-adapter';
import { z } from 'zod';
import { msg } from '@lingui/core/macro';
import {
	getAllMaps,
	getPopularMaps,
} from '../../api/maps';
import RankedMaps from '../../pages/beatmaps/RankedMaps';

const mapsSearch = z.object({
	sort: fallback(z.enum(['date', 'plays']), 'date').default('date'),
	dir: fallback(z.enum(['asc', 'desc']), 'desc').default('desc'),
	status: fallback(z.enum(['ranked', 'unranked', 'any']), 'ranked').default('ranked'),
	q: fallback(z.string(), '').default(''),
	// one PAGE_SIZE slice of the listing, like the leaderboards
	page: fallback(z.coerce.number().int().positive(), 1).default(1),
});

export const Route = createFileRoute('/maps/')({
	validateSearch: zodValidator(mapsSearch),
	loaderDeps: ({ search }) => search,
	loader: ({ deps: { sort, dir, status, q, page } }) =>
		(sort === 'plays' ? getPopularMaps : getAllMaps)(dir, {
			status, q: q || undefined, 
		}, page),
	component: MapsRoute,
	staticData: { title: msg`beatmap listing` },
});

function MapsRoute() {
	const { sort, dir, status, q, page } = Route.useSearch();
	return <RankedMaps
		sort={sort} dir={dir} status={status} q={q}
		page={page} mapsets={Route.useLoaderData()}
	/>;
}

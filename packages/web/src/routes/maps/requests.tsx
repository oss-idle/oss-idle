import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import {
	fallback,
	zodValidator,
} from '@tanstack/zod-adapter';
import { z } from 'zod';

import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';

import MapRequests from '../../pages/beatmaps/MapRequests';

const requestSearch = z.object({
	ruleset: z.enum(RULESET_IDS).optional().catch(undefined),
	filter: fallback(z.enum(['open', 'accepted', 'rejected', 'mine', 'all']), 'open').default('open'),
	sort: fallback(z.enum(['support', 'date']), 'support').default('support'),
	page: fallback(z.number().int().positive(), 1).default(1),
});

export const Route = createFileRoute('/maps/requests')({
	validateSearch: zodValidator(requestSearch),
	component: MapRequestsRoute,
	staticData: { title: msg`map requests` },
});

function MapRequestsRoute() {
	const { ruleset, filter, sort, page } = Route.useSearch();
	return <MapRequests ruleset={ruleset} filter={filter} sort={sort} page={page} />;
}

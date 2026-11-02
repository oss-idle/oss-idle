import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';

import { getProgressOverview } from '../../../../api/rankings';
import MedalProgress from '../../../../pages/rankings/MedalProgress';
import { pageSearch } from '../../../-rankingSearch';

export const Route = createFileRoute('/rankings/medals/progress/')({
	validateSearch: zodValidator(pageSearch),
	loaderDeps: ({ search: { ruleset } }) => ({ ruleset }),
	loader: ({ deps: { ruleset } }) => getProgressOverview(ruleset),
	component: ProgressRoute,
	staticData: { title: msg`rankings` },
});

function ProgressRoute() {
	return <MedalProgress lines={Route.useLoaderData()} />;
}

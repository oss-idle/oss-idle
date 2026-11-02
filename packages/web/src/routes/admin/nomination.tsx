import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';

import Nomination from '../../pages/admin/Nomination';

const nominationSearch = z.object({ ruleset: z.enum(RULESET_IDS).optional().catch(undefined) });

export const Route = createFileRoute('/admin/nomination')({
	validateSearch: zodValidator(nominationSearch),
	component: NominationRoute,
	staticData: { title: msg`beatmap nomination` },
});

function NominationRoute() {
	return <Nomination ruleset={Route.useSearch().ruleset} />;
}

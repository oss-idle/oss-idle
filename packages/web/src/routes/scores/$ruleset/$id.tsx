import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';

import { getScore } from '../../../api/scores';
import ScorePage from '../../../pages/scores/ScorePage';

// a score id is its ruleset's
export const Route = createFileRoute('/scores/$ruleset/$id')({
	params: {
		parse: ({ ruleset, id }) => ({
			ruleset: z.enum(RULESET_IDS).parse(ruleset), id, 
		}), 
	},
	loader: ({ params }) => getScore(params.id, params.ruleset),
	component: ScoreRoute,
	staticData: { title: msg`score info` },
});

function ScoreRoute() {
	return <ScorePage show={Route.useLoaderData()} />;
}

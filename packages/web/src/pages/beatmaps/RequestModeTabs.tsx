import { Trans } from '@lingui/react/macro';

import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import Link from '../../components/Link';
import type {
	RequestFilter,
	RequestSort,
} from './MapRequests';

/** The requests in each ruleset the viewer has; nothing when there's only one. */
export default function RequestModeTabs({ tabs, shown, filter, sort }: {
	tabs: readonly RulesetId[],
	shown: RulesetId,
	filter: RequestFilter,
	sort: RequestSort,
}) {
	if (tabs.length < 2) return undefined;
	return (
		<div className='requests__tabs'>
			<span className='requests__muted'><Trans>Mode</Trans></span>
			{tabs.map(id => (
				<Link
					key={id}
					to='/maps/requests'
					search={{
						ruleset: id, filter, sort, page: 1,
					}}
					className={`requests__tab requests__tab--mode ${id === shown ? 'current' : ''}`}
				>
					{rulesetLabel(id)}
				</Link>
			))}
		</div>
	);
}

import { Trans } from '@lingui/react/macro';

import Link from '../Link';
import { useBoardRuleset } from './useBoardRuleset';

/** Switches the medal rankings between medals held and how far along each line. */
export default function MedalBoardTabs({ current }: { current: 'medals' | 'progress' }) {
	const ruleset = useBoardRuleset();
	return <div className='player__lb_sort'>
		<span><Trans>Sort by</Trans></span>
		<Link to='/rankings/medals' search={{
			page: 1, ruleset,
		}} className={current === 'medals' ? 'current' : ''}>
			<Trans>Medals</Trans>
		</Link>
		<Link to='/rankings/medals/progress' search={{
			page: 1, ruleset,
		}} className={current === 'progress' ? 'current' : ''}>
			<Trans>Progress</Trans>
		</Link>
	</div>;
}

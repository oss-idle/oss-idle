import '../../components/character/RulesetSwitch.css';

import { rulesetLabel } from '@oss-idle/shared/rulesets/display';

import { useBoardRuleset } from '../../components/leaderboard/useBoardRuleset';
import Link from '../../components/Link';
import {
	ENABLED_RULESETS,
	RULESET_TABS,
} from '../../rulesets';
import { BOARD_LINKS } from './boardLinks';

/** The rankings in each ruleset, on the same board: a skill or a medal line another
 *  ruleset may not have goes back to the board's first page. */
export default function RankingsRulesetSwitch({ current }: { current: string }) {
	const shown = useBoardRuleset() ?? ENABLED_RULESETS[0];
	if (ENABLED_RULESETS.length < 2) return undefined;
	const board = BOARD_LINKS.find(b => b.id === current) ?? BOARD_LINKS[0];
	return (
		<nav className='ruleset-switch'>
			{RULESET_TABS.map(ruleset => (
				<Link
					key={ruleset}
					to={board.to}
					params={'params' in board ? board.params : undefined}
					search={{
						page: 1, ruleset,
					}}
					className={`ruleset-switch__item${ruleset === shown ? ' ruleset-switch__item--active' : ''}`}
				>
					{rulesetLabel(ruleset)}
				</Link>
			))}
		</nav>
	);
}

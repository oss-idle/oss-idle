import { useLingui } from '@lingui/react/macro';

import { useBoardRuleset } from '../../components/leaderboard/useBoardRuleset';
import Link from '../../components/Link';
import Nav from '../../components/Nav';
import { BOARD_LINKS } from './boardLinks';
import RankingsRulesetSwitch from './RankingsRulesetSwitch';

export default function RankingsNav({ current }: {
	current: string,
}) {
	const { t } = useLingui();

	const ruleset = useBoardRuleset();
	const labels: Record<typeof BOARD_LINKS[number]['id'], string> = {
		global: t`global`,
		skills: t`skills`,
		lifetime: t`lifetime`,
		prestige: t`prestige`,
		grades: t`grades`,
		medals: t`medals`,
		country: t`country`,
		'top plays': t`top plays`,
	};

	return (<>
		<Nav>
			{BOARD_LINKS.map(board => (
				<Link
					key={board.id}
					to={board.to}
					params={'params' in board ? board.params : undefined}
					search={{
						page: 1, ruleset,
					}}
					className={`nav__item ${board.id === current ? 'current' : ''}`}
				>
					{labels[board.id]}
				</Link>
			))}
		</Nav>
		<RankingsRulesetSwitch current={current} />
	</>);
}

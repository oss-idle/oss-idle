import '../../components/leaderboard/MedalProgress.css';

import { MedalCategories } from '@oss-idle/shared/achievements/catalogue';
import { medalCategoryName } from '@oss-idle/shared/display/medals';

import type { getProgressOverview } from '../../api/rankings';
import MedalBoardTabs from '../../components/leaderboard/MedalBoardTabs';
import MedalProgressCard from '../../components/leaderboard/MedalProgressCard';
import { anyMedal } from '../../rulesets';
import RankingsNav from './RankingsNav';

/** Every medal line, with the players furthest along it, by medal category. */
export default function MedalProgress({ lines }: {
	lines: Awaited<ReturnType<typeof getProgressOverview>>,
}) {
	return (
		<main>
			<RankingsNav current={'medals'} />
			<div className='page-contents'>
				<MedalBoardTabs current='progress' />
				{MedalCategories.map(category => {
					const group = lines.filter(l => anyMedal(l.goals[0]?.id ?? '')?.category === category);
					return group.length > 0 && <section key={category}>
						<h2 className='medal-progress__group'>{medalCategoryName(category)}</h2>
						<div className='medal-progress'>
							{group.map(l => <MedalProgressCard key={l.line} line={l.line} goals={l.goals} rows={l.rows} />)}
						</div>
					</section>;
				})}
			</div>
		</main>
	);
}

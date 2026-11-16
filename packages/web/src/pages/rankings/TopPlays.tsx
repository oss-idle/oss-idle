import './TopPlays.css';

import rank from '@oss-idle/shared/display/rank';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import type { getTopPlays } from '../../api/rankings';
import LeaderboardFilters from '../../components/leaderboard/LeaderboardFilters';
import Pager from '../../components/leaderboard/Pager';
import { useFriendsFilter } from '../../components/leaderboard/useFriendsFilter';
import ScoreRow from '../../components/score/ScoreRow';
import RankingsNav from './RankingsNav';

type Plays = Awaited<ReturnType<typeof getTopPlays>>;

export default function PlaysRankings({ page, ruleset, plays }: {
	page: number,
	ruleset: RulesetId,
	plays: Plays,
}) {
	const friends = useFriendsFilter();
	return (
		<main>
			<RankingsNav current={'top plays'} />
			{friends && <LeaderboardFilters filters={[friends]} />}
			<div className='page-contents'>
				{plays.map((play, r) => <div key={play.score.id} className='top-plays__row'>
					<span className='top-plays__rank'>{rank(r + 1 + ((page - 1) * PAGE_SIZE))}</span>
					<ScoreRow score={play.score} ruleset={ruleset} beatmap={play.beatmap} player={play.character} />
				</div>)}
				<Pager page={page} hasNext={plays.length === PAGE_SIZE} />
			</div>
		</main>
	);
}

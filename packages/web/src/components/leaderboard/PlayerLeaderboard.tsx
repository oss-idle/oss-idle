import './PlayerLeaderboard.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import BigNum from '@oss-idle/shared/display/BigNum';
import num from '@oss-idle/shared/display/num';
import rank from '@oss-idle/shared/display/rank';
import int from '@oss-idle/shared/math/int';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import hitAccuracy from '@oss-idle/shared/rulesets/mania/hitAccuracy';
import { countsOf } from '@oss-idle/shared/rulesets/ruleset';

import type { getGlobalRanking } from '../../api/rankings';
import { useCurrentCharacter } from '../../hooks/useCurrentCharacter';
import Flag from '../Flag';
import Link from '../Link';
import Pager from './Pager';

export type ScoreSort = 'pp' | 'rankedScore';

type Players = Awaited<ReturnType<typeof getGlobalRanking>>;

export default function PlayerLeaderboard({ sort, country, page, players }: {
	sort: ScoreSort,
	page: number,
	country?: string,
	players: Players,
}) {
	const self = useCurrentCharacter();
	const { t } = useLingui();

	return (<div className='player__lb'>
		<div className='player__lb_sort'>
			<span><Trans>Sort by</Trans></span>
			<Link to='/rankings/global' search={prev => ({
				...prev, page, country,
			})} className={sort === 'pp' ? 'current' : ''}>{t`Performance`}</Link>
			<Link to='/rankings/score' search={prev => ({
				...prev, page, country,
			})} className={sort === 'rankedScore' ? 'current' : ''}>{t`Ranked Score`}</Link>
		</div>

		<div className='player__lb_scroll'>
			<table className='player__lb_listing'>
				<thead>
					<tr>
						<th></th>
						<th></th>
						<th><Trans>Accuracy</Trans></th>
						<th><Trans>Play Count</Trans></th>
						<th className={sort === 'rankedScore' ? 'current' : ''}><Trans>Ranked Score</Trans></th>
						<th className={sort === 'pp' ? 'current' : ''}><Trans>Performance</Trans></th>
						<th className='extra'>X</th>
						<th className='extra'>SS</th>
						<th className='extra'>S</th>
						<th className='extra'>A</th>
					</tr>
				</thead>
				<tbody>
					{players.map((player, r) => <tr
						key={player.character.id}
						className={player.character.id === self?.id ? 'is-self' : undefined}
					>
						<td>{rank(r+1+((page - 1) * PAGE_SIZE))}</td>
						<td className='main'><div className='player__lb_listing_main'>
							<Flag country={player.user.country} />
							<Link to='/c/$id' params={{ id: String(player.character.id) }}>{player.character.name}</Link>
						</div></td>
						<td className='dimmed'>{accuracy(hitAccuracy(countsOf(player.totals)))}</td>
						<td className='dimmed'><BigNum value={player.totals.playCount} theme='ocean' /></td>
						<td className={`${sort === 'rankedScore' ? 'current' : 'dimmed'}`}>
							{num(player.totals.rankedScore)}
						</td>
						<td className={`${sort === 'pp' ? 'current' : 'dimmed'}`}>
							{num(int(player.profile.pp) ?? 0)}
						</td>
						<td className='dimmed extra'><BigNum value={player.totals.X} theme='ocean' /></td>
						<td className='dimmed extra'><BigNum value={player.totals.SS} theme='ocean' /></td>
						<td className='dimmed extra'><BigNum value={player.totals.S} theme='ocean' /></td>
						<td className='dimmed extra'><BigNum value={player.totals.A} theme='ocean' /></td>
					</tr>)}
				</tbody>
			</table>
		</div>
		<Pager page={page} hasNext={players.length === PAGE_SIZE} />
	</div>);
}

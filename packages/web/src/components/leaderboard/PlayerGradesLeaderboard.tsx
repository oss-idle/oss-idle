import './PlayerLeaderboard.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import BigNum from '@oss-idle/shared/display/BigNum';
import num from '@oss-idle/shared/display/num';
import rank from '@oss-idle/shared/display/rank';
import {
	GoodGrade,
	GoodGrades,
} from '@oss-idle/shared/grade';
import sum from '@oss-idle/shared/helpers/sum';
import int from '@oss-idle/shared/math/int';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import hitAccuracy from '@oss-idle/shared/rulesets/mania/hitAccuracy';
import { countsOf } from '@oss-idle/shared/rulesets/ruleset';

import type { getGradesRanking } from '../../api/rankings';
import { useCurrentCharacter } from '../../hooks/useCurrentCharacter';
import Flag from '../Flag';
import Link from '../Link';
import Pager from './Pager';

type Sort = GoodGrade | 'all';

type Players = Awaited<ReturnType<typeof getGradesRanking>>;

export default function PlayerGradesLeaderboard({ sort, country, page, players }: {
	sort: Sort,
	page: number,
	country?: string,
	players: Players,
}) {
	const self = useCurrentCharacter();
	const { t } = useLingui();

	const sorts = [...GoodGrades, 'all'] as const;
	const sortLabel = (sort: Sort) => sort === 'all' ? t`Total` : sort;

	type Player = Players[number];

	const totalGrades = (p: Player) =>
		sum(GoodGrades.map(g => p.totals[g]));

	const untie = (a: Player, b: Player) => {
		if (a.totals.X !== b.totals.X)
			return b.totals.X - a.totals.X;

		if (a.totals.SS !== b.totals.SS)
			return b.totals.SS - a.totals.SS;

		if (a.totals.S !== b.totals.S)
			return b.totals.S - a.totals.S;

		if (a.totals.A !== b.totals.A)
			return b.totals.A - a.totals.A;

		return totalGrades(b) - totalGrades(a);
	};

	const sortedPlayers = [...players].sort((a, b) => {
		const aScore = sort === 'all'
			? sum(GoodGrades.map(g => a.totals[g]))
			: a.totals[sort];

		const bScore = sort === 'all'
			? sum(GoodGrades.map(g => b.totals[g]))
			: b.totals[sort];

		// preserve original order when not tied
		if (aScore !== bScore)
			return 0;

		return untie(a, b);
	});

	return (<div className='player__lb'>
		<div className='player__lb_sort'>
			<span><Trans>Sort by</Trans></span>
			{sorts.map(type => <Link
				key={type}
				to='/rankings/grades/$grade'
				params={{ grade: type }}
				search={prev => ({
					...prev, page, country,
				})}
				className={`${sort === type ? 'current' : ''}`}>
				{sortLabel(type)}
			</Link>)}
		</div>

		<div className='player__lb_scroll'>
			<table className='player__lb_listing'>
				<thead>
					<tr>
						<th></th>
						<th></th>
						<th className='extra'><Trans>Accuracy</Trans></th>
						<th className='extra'><Trans>Play Count</Trans></th>
						<th className='extra'><Trans>Ranked Score</Trans></th>
						<th className='extra'><Trans>Performance</Trans></th>
						{...sorts.map(type => <th key={type} className={sort === type ? 'current' : ''}>
							{sortLabel(type)}
						</th>)}
					</tr>
				</thead>
				<tbody>
					{sortedPlayers.map((player, r) => <tr
						key={player.character.id}
						className={player.character.id === self?.id ? 'is-self' : undefined}
					>
						<td>{rank(r+1+((page - 1) * PAGE_SIZE))}</td>
						<td className='main'><div className='player__lb_listing_main'>
							<Flag country={player.user.country} />
							<Link to='/c/$id' params={{ id: String(player.character.id) }}>{player.character.name}</Link>
						</div></td>
						<td className='dimmed extra'>{accuracy(hitAccuracy(countsOf(player.totals)))}</td>
						<td className='dimmed extra'><BigNum value={player.totals.playCount} theme='ocean' /></td>
						<td className='dimmed extra'>{num(player.totals.rankedScore)}</td>
						<td className='dimmed extra'>{num(int(player.profile.pp) ?? 0)}</td>
						{...GoodGrades.map(type => <td key={type} className={sort === type ? 'current' : 'dimmed'}>
							<BigNum value={player.totals[type]} theme='ocean' />
						</td>)}
						<td className={sort === 'all' ? 'current' : 'dimmed'}>
							<BigNum value={sum(GoodGrades.map(g => player.totals[g]))} theme='ocean' />
						</td>
					</tr>)}
				</tbody>
			</table>
		</div>
		<Pager page={page} hasNext={players.length === PAGE_SIZE} />
	</div>);
}

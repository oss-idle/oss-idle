import './PlayerLeaderboard.css';

import { Trans } from '@lingui/react/macro';

import BigNum from '@oss-idle/shared/display/BigNum';
import rank from '@oss-idle/shared/display/rank';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';

import type { getMedalRanking } from '../../api/rankings';
import { useCurrentCharacter } from '../../hooks/useCurrentCharacter';
import { rulesetDef } from '../../rulesets';
import Flag from '../Flag';
import Link from '../Link';
import Pager from './Pager';
import { useBoardRuleset } from './useBoardRuleset';

type Players = Awaited<ReturnType<typeof getMedalRanking>>;

export default function PlayerMedalLeaderboard({ page, players }: {
	page: number,
	players: Players,
}) {
	const self = useCurrentCharacter();
	const medalCount = rulesetDef(useBoardRuleset()).medals.medals.length;
	return (<div className='player__lb'>
		<div className='player__lb_scroll'>
			<table className='player__lb_listing'>
				<thead>
					<tr>
						<th></th>
						<th></th>
						<th><Trans>Play Count</Trans></th>
						<th><Trans>Medals</Trans></th>
						<th className='current'><Trans>Medal Score</Trans></th>
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
						<td className='dimmed'><BigNum value={player.totals.playCount} theme='ocean' /></td>
						<td className='dimmed'>{player.medals.held} / {medalCount}</td>
						<td className='current'><BigNum value={player.medals.score} theme='ocean' decimals={2} /></td>
					</tr>)}
				</tbody>
			</table>
		</div>
		<Pager page={page} hasNext={players.length === PAGE_SIZE} />
	</div>);
}

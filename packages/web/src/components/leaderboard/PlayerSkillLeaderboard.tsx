import './PlayerLeaderboard.css';

import { Trans } from '@lingui/react/macro';

import { levelFromTotalXp } from '@oss-idle/shared/display/levelDisplay';
import rank from '@oss-idle/shared/display/rank';
import SkillLevel from '@oss-idle/shared/display/SkillLevel';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';

import type { getSkillRanking } from '../../api/rankings';
import { useCurrentCharacter } from '../../hooks/useCurrentCharacter';
import { rulesetDef } from '../../rulesets';
import Flag from '../Flag';
import Link from '../Link';
import Pager from './Pager';

/** 'overall', or one of the ruleset's skills. */
export type SkillSort = string;
const skillSorts = (): SkillSort[] => ['overall', ...rulesetDef().skills];

type Players = Awaited<ReturnType<typeof getSkillRanking>>;
type Player = Players[number];

/**
 * Which measure of a skill the table is showing. The three read the same rows -
 * what a skill holds now, what it has ever earned, and how often it has been
 * reset - so they share a table rather than three near-copies of one.
 */
export const BOARDS = {
	skills: '/rankings/skills/$skill',
	lifetime: '/rankings/lifetime/$skill',
	prestige: '/rankings/prestige/$skill',
} as const;
export type Board = keyof typeof BOARDS;

const cell = (board: Board, player: Player, s: SkillSort) => {
	const p = player.profile;
	if (board === 'prestige') {
		return s === 'overall'
			? Object.values(p.skills).reduce((n, k) => n + k.prestige, 0)
			: p.skills[s].prestige;
	}
	if (board === 'lifetime') {
		return levelFromTotalXp(s === 'overall' ? p.overallLifetimeXp : p.skills[s].lifetimeXp);
	}
	// the level shown, with its parts on hover
	return s === 'overall'
		? levelFromTotalXp(p.overallLifetimeXp)
		: <SkillLevel
			level={p.skills[s].level}
			xp={p.skills[s].xp}
			prestige={p.skills[s].prestige}
			lifetimeXp={p.skills[s].lifetimeXp}
		/>;
};

export default function PlayerSkillLeaderboard({
	page, sort, country, players, board = 'skills',
}: {
	sort: SkillSort,
	page: number,
	country?: string,
	players: Players,
	board?: Board,
}) {
	const self = useCurrentCharacter();
	return (<div className='player__lb'>
		<div className='player__lb_sort'>
			<span><Trans>Sort by</Trans></span>
			{skillSorts().map(type => <Link
				key={type}
				to={BOARDS[board]}
				params={{ skill: type }}
				search={prev => ({
					...prev, page: 1, country,
				})}
				className={`${sort === type ? 'current' : ''}`}>
				{rulesetDef().skillName(type)}
			</Link>)}
		</div>

		<div className='player__lb_scroll'>
			<table className='player__lb_listing player__lb_listing_skill'>
				<thead>
					<tr>
						<th></th>
						<th></th>
						{skillSorts().map(s => <th key={s} className={sort === s ? 'current' : ''}>
							{rulesetDef().skillName(s)}
						</th>)}
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
						{skillSorts().map(s => <td key={s} className={sort === s ? 'current' : 'dimmed'}>
							{cell(board, player, s)}
						</td>)}
					</tr>)}
				</tbody>
			</table>
		</div>
		<Pager page={page} hasNext={players.length === PAGE_SIZE} />
	</div>);
}

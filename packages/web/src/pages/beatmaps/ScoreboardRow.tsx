import accuracy from '@oss-idle/shared/display/accuracy';
import { dateAgo } from '@oss-idle/shared/display/ago';
import num, { bignum } from '@oss-idle/shared/display/num';

import type { BoardRow } from '../../api/maps';
import Flag from '../../components/Flag';
import Link from '../../components/Link';
import Grade from '../../components/score/Grade';
import ScoreLink from '../../components/score/ScoreLink';
import ScoreMods from '../../components/score/ScoreMods';
import type { judgementColumns } from './judgementColumns';

/** One line of the map's score table. */
export default function ScoreboardRow({
	row, rank, loved, columns,
}: {
	row: BoardRow;
	rank: number;
	loved: boolean;
	columns: ReturnType<typeof judgementColumns>;
}) {
	const { score, player } = row;
	return <tr className='mapset__row'>
		<td className='mapset__rank'>
			<ScoreLink id={score.id} label={`#${rank}`} />
			#{rank}
		</td>
		<td><Grade grade={score.grade} /></td>
		<td className='mapset__score'>{num(score.score)}</td>
		<td>{accuracy(score.accuracy)}</td>
		<td><div className='mapset__player'>
			<Flag country={player.country} />
			<Link to='/c/$id' params={{ id: String(player.id) }}>{player.name}</Link>
		</div></td>
		<td>{bignum(score.maxCombo)}x</td>
		{columns.map(j => {
			const count = score.judgements[j.judgement];
			return <td key={j.judgement} className={count ? '' : 'zero'}>{bignum(count)}</td>;
		})}
		{!loved && <td>{num(score.pp)}</td>}
		<td className='mapset__when'>{dateAgo(score.playedAt)}</td>
		<td><ScoreMods mods={score.mods} rate={score.rate} /></td>
	</tr>;
}

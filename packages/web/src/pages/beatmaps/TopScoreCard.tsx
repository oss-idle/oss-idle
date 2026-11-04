import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import { dateAgo } from '@oss-idle/shared/display/ago';
import num, { bignum } from '@oss-idle/shared/display/num';

import type { BoardRow } from '../../api/maps';
import Flag from '../../components/Flag';
import Link from '../../components/Link';
import ProfilePicture from '../../components/ProfilePicture';
import Grade from '../../components/score/Grade';
import ScoreLink from '../../components/score/ScoreLink';
import { judgementColumns } from './judgementColumns';

/** osu!'s card for the map's #1, above the table. */
export default function TopScoreCard({ row, loved }: { row: BoardRow; loved: boolean }) {
	const { score, player } = row;
	const stats = [
		{
			label: <Trans>Total score</Trans>, value: num(score.score),
		},
		{
			label: <Trans>Accuracy</Trans>, value: accuracy(score.accuracy),
		},
		{
			label: <Trans>Max combo</Trans>, value: `${bignum(score.maxCombo)}x`,
		},
		...judgementColumns([score.judgements.DIVINE]).map(j => ({
			label: j.label, value: bignum(score.judgements[j.judgement]),
		})),
		...loved ? [] : [{
			label: 'pp', value: num(score.pp),
		}],
	];
	return <div className='mapset__top'>
		<ScoreLink id={score.id} label='#1' />
		<div className='mapset__top-player'>
			<span className='mapset__top-rank'>#1</span>
			<Grade grade={score.grade} />
			<ProfilePicture avatarUrl={player.avatarUrl} className='mapset__top-avatar' />
			<div>
				<Link to='/c/$id' params={{ id: String(player.id) }} className='mapset__top-name'>
					{player.name}
				</Link>
				<div className='mapset__top-when'>
					<Trans>achieved {ph({ when: dateAgo(score.playedAt) })}</Trans>
				</div>
				<Flag country={player.country} />
			</div>
		</div>
		<div className='mapset__top-stats'>
			{stats.map((s, i) => <div key={i} className='mapset__top-stat'>
				<div className='mapset__top-label'>{s.label}</div>
				<div className='mapset__top-value'>{s.value}</div>
			</div>)}
		</div>
	</div>;
}

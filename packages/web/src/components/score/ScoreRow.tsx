import './ScoreRow.css';

import type { InferResponseType } from 'hono/client';

import accuracy from '@oss-idle/shared/display/accuracy';
import { dateAgo } from '@oss-idle/shared/display/ago';
import num from '@oss-idle/shared/display/num';

import { rpc } from '../../api/client';
import Flag from '../Flag';
import Link from '../Link';
import Grade from './Grade';
import ScoreLink from './ScoreLink';
import ScoreMods from './ScoreMods';

type Score = InferResponseType<(typeof rpc.v1.scores[':id'])['$get'], 200>;
type Beatmap = Pick<InferResponseType<(typeof rpc.v1.beatmap[':id'])['$get'], 200>, 'title' | 'artist' | 'version'>;

export default function ScoreRow({
	score, beatmap, player, loved,
}: {
	score: Score,
	beatmap: Beatmap,
	/** a loved map's score: no pp */
	loved?: boolean,
	player?: {
		id: number,
		name: string,
		country: string,
	},
}) {

	return (<div className='score__row'>
		<ScoreLink id={score.id} label={beatmap.title} />
		<div className='score__top'>
			<div className='score__grade'><Grade grade={score.grade} /></div>
			<div className='score__title'>
				<div className='score__md'>{beatmap.title} by {beatmap.artist}</div>
				<div className='score__mb'>
					{player && <div className='score__player'>
						<Flag country={player.country} />
						<Link to='/c/$id' params={{ id: String(player.id) }}>{player.name}</Link>
					</div>}
					<b>{beatmap.version}</b> <span>{dateAgo(score.playedAt)}</span></div>
			</div>
			<div className='score__acc'>
				<ScoreMods mods={score.mods} rate={score.rate} /> {accuracy(score.accuracy)}
			</div>
		</div>
		<div className='score__bottom'>
			<div className='score__pp-flow'>
				<div className='score__pp-container'>
					<div className='score__pp'>
						{loved ? '—' : <>
							{num(Number(score.pp))}
							<span className="score__pp_unit">pp</span>
						</>}
					</div>
				</div>
			</div>
		</div>
	</div>);
}
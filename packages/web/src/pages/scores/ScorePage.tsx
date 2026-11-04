import './ScorePage.css';

import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import {
	difficultyColor,
	difficultyTextColor,
	starsText,
} from '@oss-idle/shared/display/difficulty';
import num, { bignum } from '@oss-idle/shared/display/num';
import rank from '@oss-idle/shared/display/rank';

import { coverBackground } from '../../api/maps';
import type { getScore } from '../../api/scores';
import Flag from '../../components/Flag';
import Link from '../../components/Link';
import MapperLink from '../../components/MapperLink';
import ProfilePicture from '../../components/ProfilePicture';
import ScoreDial from '../../components/score/ScoreDial';
import ScoreMods from '../../components/score/ScoreMods';
import ScoreTower from '../../components/score/ScoreTower';
import { i18n } from '../../i18n';
import { judgementColumns } from '../beatmaps/judgementColumns';

/** osu!web's score page (scores-show): the map, the grade dial and score, then the stats. */
export default function ScorePage({ show }: { show: Awaited<ReturnType<typeof getScore>> }) {
	const {
		score, beatmap, beatmapset, player,
	} = show;
	const stars = Number(beatmap.sr);
	const judgements = judgementColumns([score.judgements.DIVINE]);
	const mapLink = {
		to: '/maps/$id', params: { id: String(beatmapset.id) }, search: { diff: beatmap.id },
	} as const;

	return <main>
		<div className='score-beatmap'>
			<h1 className='score-beatmap__title'>
				<Link {...mapLink}>
					{beatmapset.title} <span className='score-beatmap__artist'>
						<Trans>by {ph({ artist: beatmapset.artist })}</Trans>
					</span>
				</Link>
			</h1>
			<div className='score-beatmap__detail'>
				<span className='score-beatmap__stars' style={{
					backgroundColor: difficultyColor(stars), color: difficultyTextColor(stars), 
				}}>
					★ {starsText(stars)}
				</span>
				<b>{beatmap.version}</b>
				<span><Trans>
					mapped by <MapperLink userId={beatmapset.ownerUserId} className='mapper-link'>
						{ph({ creator: beatmapset.creator })}
					</MapperLink>
				</Trans></span>
			</div>
		</div>

		<div className='score-info' style={{ backgroundImage: coverBackground(beatmapset, 'cover') }}>
			<div className='score-info__item'><ScoreTower grade={score.grade} /></div>
			<div className='score-info__item score-info__item--dial'>
				<ScoreDial accuracy={score.accuracy} grade={score.grade} />
			</div>
			<div className='score-info__item score-info__item--player'>
				<div className='score-player__mods'><ScoreMods mods={score.mods} rate={score.rate} /></div>
				<div className='score-player__score'>{num(score.score)}</div>
				<div className='score-player__row--player'>
					<span><Trans>Played by</Trans></span>
					<strong>{player.name}</strong>
					<span><Trans>Submitted on</Trans></span>
					<strong>
						{new Date(score.playedAt).toLocaleString(i18n.locale, {
							dateStyle: 'long', timeStyle: 'short', 
						})}
					</strong>
				</div>
				<div className='score-player__row--rank'>
					<div className='score-player__rank score-player__rank--label'><Trans>Global Rank</Trans></div>
					<div className='score-player__rank score-player__rank--value'>{rank(show.rank)}</div>
				</div>
			</div>
		</div>

		<div className='score-stats'>
			<div className='score-stats__group score-stats__group--user'>
				<Link to='/c/$id' params={{ id: String(player.id) }} className='score-user'>
					<ProfilePicture avatarUrl={player.avatarUrl} className='score-user__avatar' />
					<div>
						<div className='score-user__name'>{player.name}</div>
						<Flag country={player.country} />
					</div>
				</Link>
			</div>
			<div className='score-stats__group score-stats__group--stats'>
				<div className='score-stats__row'>
					<div className='score-stats__stat'>
						<div className='score-stats__label'><Trans>Accuracy</Trans></div>
						<div className={`score-stats__value ${score.accuracy === 1 ? 'score-stats__value--perfect' : ''}`}>
							{accuracy(score.accuracy)}
						</div>
					</div>
					<div className='score-stats__stat'>
						<div className='score-stats__label'><Trans>Max Combo</Trans></div>
						<div className={`score-stats__value ${score.pfc ? 'score-stats__value--perfect' : ''}`}>
							{bignum(score.maxCombo)}x
						</div>
					</div>
					<div className='score-stats__stat'>
						<div className='score-stats__label'>pp</div>
						<div className='score-stats__value'>
							{beatmapset.status === 'loved' ? '—' : num(Math.round(score.pp))}
						</div>
					</div>
				</div>
				<div className='score-stats__row'>
					{judgements.map(j => <div key={j.judgement} className='score-stats__stat'>
						<div className='score-stats__label'>{j.label}</div>
						<div className='score-stats__value'>{bignum(score.judgements[j.judgement])}</div>
					</div>)}
				</div>
			</div>
		</div>
	</main>;
}

import {
	faHeart,
	faPlayCircle,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useState } from 'react';

import { osuSetUrl } from '@oss-idle/shared/beatmap';
import { dateAgo } from '@oss-idle/shared/display/ago';
import BigNum from '@oss-idle/shared/display/BigNum';
import {
	difficultyColor,
	difficultyTextColor,
	starsText,
} from '@oss-idle/shared/display/difficulty';

import {
	coverBackground,
	type MapDiff,
	type Mapset,
} from '../../api/maps';
import MapperLink from '../../components/MapperLink';
import OutLink from '../../components/OutLink';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import BeatmapsetStats from './BeatmapsetStats';
import DifficultyPicker from './DifficultyPicker';
import DownloadButton from './DownloadButton';
import FavouriteButton from './FavouriteButton';
import MapsetRulesetTabs from './MapsetRulesetTabs';

/** osu!'s beatmap header: the cover, the difficulties, who made it, then its stats. */
export default function BeatmapsetHeader({ mapset, diff }: { mapset: Mapset; diff: MapDiff }) {
	const { t } = useLingui();
	const { set } = mapset;
	const me = useCurrentUser();
	const [favourite, setFavourite] = useState({
		favourited: mapset.favourited, count: set.favouriteCount,
	});
	const osu = osuSetUrl(set.osuId);
	const cover = coverBackground({
		...set, background: diff.background,
	}, 'cover');
	return <div className='mapset__header'>
		<div className='mapset__cover' style={{ backgroundImage: cover }} />
		<div className='mapset__main'>
			<MapsetRulesetTabs setId={set.id} current={mapset.ruleset} rulesets={mapset.rulesets} />
			<DifficultyPicker setId={set.id} ruleset={mapset.ruleset} diffs={mapset.diffs} current={diff.id} />
			<div className='mapset__version'>
				{diff.version}
				<span className='mapset__stars' style={{
					backgroundColor: difficultyColor(diff.sr), color: difficultyTextColor(diff.sr), 
				}}>
					★ {starsText(diff.sr)}
				</span>
			</div>
			<div className='mapset__counts'>
				<span className='mapset__plays' title={t`plays`}>
					<FontAwesomeIcon icon={faPlayCircle} /> <BigNum value={Number(diff.plays)} theme='cold' />
				</span>
				<span className='mapset__plays'>
					<FontAwesomeIcon icon={faHeart} /> <BigNum value={Number(favourite.count)} theme='aurora' />
				</span>
			</div>
			<div className='mapset__title'>{set.title}</div>
			<div className='mapset__artist'>{set.artist}</div>
			<div className='mapset__mapper'>
				<Trans>mapped by <MapperLink userId={set.ownerUserId} className='mapper-link'>{ph({ creator: set.creator })}</MapperLink></Trans>
			</div>
			<div className='mapset__buttons'>
				{me && <FavouriteButton
					setId={set.id}
					favourited={favourite.favourited}
					onChange={(favourited, count) => setFavourite({
						favourited, count,
					})}
				/>}
				<DownloadButton setId={set.id} />
				{osu && <OutLink href={osu} target='_blank' className='mapset__button'>
					<Trans>osu! page</Trans>
				</OutLink>}
			</div>
		</div>
		<div className='mapset__side'>
			<div className='mapset__status'>
				{set.status === 'unranked'
					? <span className='mapset__status-badge'><Trans>unranked</Trans></span>
					: set.status === 'pending'
						? <span className='mapset__status-badge'><Trans>pending</Trans></span>
						: set.status === 'planned'
							? <span className='mapset__status-badge'><Trans>planned</Trans></span>
							: set.status === 'loved'
								? <span className='mapset__status-badge is-loved'><Trans>loved</Trans></span>
								: <span className='mapset__status-badge'><Trans>ranked</Trans></span>}
				<span>{dateAgo(set.status === 'unranked' ? set.createdAt
					: set.status === 'pending' || set.status === 'planned' ? set.submittedAt : set.rankedAt)}</span>
			</div>
			<BeatmapsetStats setId={set.id} diff={diff} />
		</div>
	</div>;
}

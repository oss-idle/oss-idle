import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { bignum } from '@oss-idle/shared/display/num';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { getCharacterMostPlayed } from '../../api/characters';
import { coverBackground } from '../../api/maps';
import { useShowMore } from '../../hooks/useShowMore';
import MapperLink from '../MapperLink';
import ShowMoreLink from '../ShowMoreLink';

/** The profile's Historical block: the most played beatmaps. */
export default function CharacterHistorical({ id, ruleset, countplayed }: {
	id: string;
	ruleset: RulesetId;
	countplayed?: number;
}) {
	const mostplayed = useShowMore(page => getCharacterMostPlayed(id, page, ruleset), [id, ruleset]);

	return <div className='character__block character__block-skills'>
		<div className='character__block-title'><Trans>Historical</Trans></div>
		<div className='character__block-section'>
			<div className='character__block-section-title'>
				<Trans>Most Played Beatmaps</Trans>
				<div className='character__block-section-title-count'>{bignum(countplayed)}
				</div>
			</div>
			<div className='character__mostplayed'>
				{mostplayed.items?.map(mp => <div key={mp.beatmap.id} className='mostplayed__container'>
					<div
						className='mostplayed__bg'
						style={{
							backgroundImage: coverBackground({
								...mp.beatmapset, background: mp.beatmap.background,
							}, 'list'), 
						}}
					></div>
					<div className='mostplayed__bm'>
						<div className='mostplayed__bminfo'>
							<div className='mostplayed__bmt'>
								<Trans>{ph({ title: mp.beatmap.title })} [{ph({ version: mp.beatmap.version })}] by {ph({ artist: mp.beatmap.artist })}</Trans>
							</div>
							<div className='mostplayed__bmc'>
								<Trans>mapped by <MapperLink userId={mp.beatmapset.ownerUserId} className='mapper-link'>{ph({ creator: mp.beatmapset.creator })}</MapperLink></Trans>
							</div>
						</div>
						<div className='mostplayed__pl'>
							<FontAwesomeIcon icon={faPlay} />
							<span>{mp.beatmaps_played.plays}</span>
						</div>
					</div>
				</div>)}
			</div>
			<ShowMoreLink {...mostplayed} onClick={mostplayed.more} />
		</div>
	</div>;
}

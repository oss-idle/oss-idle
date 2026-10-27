import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import num from '@oss-idle/shared/display/num';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	getCharacterMostPlayed,
	getCharacterPlayCounts,
} from '../../api/characters';
import { coverBackground } from '../../api/maps';
import { useShowMore } from '../../hooks/useShowMore';
import MapperLink from '../MapperLink';
import ShowMoreLink from '../ShowMoreLink';
import PlayHistoryGraph from './PlayHistoryGraph';

/** The profile's Historical block: play history and the most played beatmaps. */
export default function CharacterHistorical({ id, ruleset, countplayed }: {
	id: string;
	ruleset: RulesetId;
	countplayed?: number;
}) {
	const mostplayed = useShowMore(page => getCharacterMostPlayed(id, page, ruleset), [id, ruleset]);
	// null marks a failed load, so it can't be mistaken for the empty series.
	const playCounts = useAsync(
		() => getCharacterPlayCounts(id, ruleset).catch(() => null),
		[id, ruleset],
	);

	const note = (text: ReactNode) => <p className='character__block-section-note'>{text}</p>;
	const playHistory = () => {
		if (playCounts === undefined) return note(<Trans>Loading…</Trans>);
		if (playCounts === null) return note(<Trans>Could not load play history.</Trans>);
		if (playCounts.length === 0) return note(<Trans>No plays yet.</Trans>);
		return <PlayHistoryGraph rows={playCounts} />;
	};

	return <div className='character__block character__block-skills'>
		<div className='character__block-title'><Trans>Historical</Trans></div>
		<div className='character__block-section'>
			<div className='character__block-section-title'><Trans>Play History</Trans></div>
			{playHistory()}
		</div>
		<div className='character__block-section'>
			<div className='character__block-section-title'>
				<Trans>Most Played Beatmaps</Trans>
				<div className='character__block-section-title-count'>{num(countplayed)}
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

import './CharacterRecent.css';

import { Trans } from '@lingui/react/macro';

import { getCharacterEvents } from '../../api/characters';
import { useShowMore } from '../../hooks/useShowMore';
import ShowMoreLink from '../ShowMoreLink';
import RecentEvent from './RecentEvent';

/** osu!web's Recent block: the profile's activity, newest first. Left out while empty. */
export default function CharacterRecent({ id, name }: { id: string, name: string }) {
	const events = useShowMore(page => getCharacterEvents(id, page), [id]);
	if (!events.items?.length) return null;

	return <div className='character__block'>
		<div className='character__block-title'><Trans>Recent</Trans></div>
		<ul className='profile-events'>
			{events.items.map(e => <RecentEvent key={e.id} entry={e} name={name} />)}
		</ul>
		<ShowMoreLink {...events} onClick={events.more} />
	</div>;
}

import { Trans } from '@lingui/react/macro';

import useAsync from '@oss-idle/shared/hooks/useAsync';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	getCharacterFavourites,
	getCharacterMapped,
	getCharacterNbFavourites,
	getCharacterNbMapped,
	getCharacterNbRankedMaps,
	getCharacterRankedMaps,
} from '../../api/characters';
import CharacterMapsSection from './CharacterMapsSection';

/** osu!'s profile beatmaps: the account's favourites, the maps it made, ranked, loved and
 *  unranked, and the approved maps it proposed. Left out when there are none. */
export default function CharacterBeatmaps({ id, ruleset }: { id: string, ruleset: RulesetId }) {
	const any = useAsync(async () => {
		const counts = await Promise.all([
			getCharacterNbFavourites(id, ruleset),
			getCharacterNbMapped(id, 'ranked', ruleset),
			getCharacterNbMapped(id, 'loved', ruleset),
			getCharacterNbMapped(id, 'unranked', ruleset),
			getCharacterNbRankedMaps(id, ruleset),
		]);
		return counts.some(n => n > 0);
	}, [id]);
	if (!any) return null;

	return <div className='character__block'>
		<div className='character__block-title'><Trans>Beatmaps</Trans></div>
		<CharacterMapsSection
			ruleset={ruleset}
			title={<Trans>Favourite Beatmaps</Trans>}
			count={() => getCharacterNbFavourites(id, ruleset)}
			page={page => getCharacterFavourites(id, page, ruleset)}
			deps={[id]}
		/>
		<CharacterMapsSection
			ruleset={ruleset}
			title={<Trans>Ranked Beatmaps</Trans>}
			count={() => getCharacterNbMapped(id, 'ranked', ruleset)}
			page={page => getCharacterMapped(id, 'ranked', page, ruleset)}
			deps={[id]}
		/>
		<CharacterMapsSection
			ruleset={ruleset}
			title={<Trans>Loved Beatmaps</Trans>}
			count={() => getCharacterNbMapped(id, 'loved', ruleset)}
			page={page => getCharacterMapped(id, 'loved', page, ruleset)}
			deps={[id]}
		/>
		<CharacterMapsSection
			ruleset={ruleset}
			title={<Trans>Unranked Beatmaps</Trans>}
			count={() => getCharacterNbMapped(id, 'unranked', ruleset)}
			page={page => getCharacterMapped(id, 'unranked', page, ruleset)}
			deps={[id]}
		/>
		<CharacterMapsSection
			ruleset={ruleset}
			title={<Trans>Proposed Beatmaps</Trans>}
			count={() => getCharacterNbRankedMaps(id, ruleset)}
			page={page => getCharacterRankedMaps(id, page, ruleset)}
			deps={[id]}
		/>
	</div>;
}

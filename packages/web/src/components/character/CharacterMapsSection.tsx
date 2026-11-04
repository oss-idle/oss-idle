import type { ReactNode } from 'react';

import { bignum } from '@oss-idle/shared/display/num';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { useShowMore } from '../../hooks/useShowMore';
import MapsetCard, { type Mapset } from '../MapsetCard';
import ShowMoreLink from '../ShowMoreLink';

type Props = {
	title: ReactNode,
	ruleset: RulesetId,
	count: () => Promise<number>,
	page: (page: number) => Promise<{ items: Mapset[], hasMore: boolean }>,
	deps: unknown[],
};

/** One list of the profile's beatmaps block, left out while it is empty. */
export default function CharacterMapsSection({ title, ruleset, count, page, deps }: Props) {
	const total = useAsync(count, deps);
	const maps = useShowMore(page, deps);
	if (!total) return null;

	return <div className='character__block-section'>
		<div className='character__block-section-title'>
			{title}
			<div className='character__block-section-title-count'>{bignum(total)}</div>
		</div>
		<div className='list__beatmap-container'>
			{maps.items?.map(mapset => <MapsetCard key={mapset.id} mapset={mapset} ruleset={ruleset} />)}
		</div>
		<ShowMoreLink {...maps} onClick={maps.more} />
	</div>;
}

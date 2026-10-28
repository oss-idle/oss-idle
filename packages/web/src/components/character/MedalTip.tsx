import './CharacterMedals.css';

import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import type { MedalDef } from '@oss-idle/shared/achievements/catalogue';
import {
	medalCategoryName,
	medalTierName,
} from '@oss-idle/shared/display/medals';

import {
	medalDescription,
	medalName,
} from '../../rulesets';

/** osu!'s medal tooltip: category, big icon, name and description. */
export default function MedalTip({ medal, icon, hidden, floating, children }: {
	medal: MedalDef,
	icon: ReactNode,
	hidden?: boolean,
	/** in a HoverCard rather than over its medal */
	floating?: boolean,
	children?: ReactNode,
}) {
	return <div className={`profile-medal__tip ${floating ? 'is-floating' : ''}`}>
		<div className='profile-medal__group'>
			<Trans>{ph({ category: medalCategoryName(medal.category) })} ({ph({ tier: medalTierName(medal.tier) })})</Trans>
		</div>
		<div className='profile-medal__main'>
			<div className='profile-medal__big'>{icon}</div>
			<div className='profile-medal__name'>{medalName(medal.id)}</div>
			<div className='profile-medal__desc'>
				{hidden ? <Trans>A hidden medal</Trans> : medalDescription(medal.id)}
			</div>
		</div>
		{children}
	</div>;
}

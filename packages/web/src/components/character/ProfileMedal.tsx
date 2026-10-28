import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import {
	type MedalDef,
	medalLook,
} from '@oss-idle/shared/achievements/catalogue';

import MedalIcon from './MedalIcon';
import MedalProgressBar from './MedalProgressBar';
import MedalTip from './MedalTip';

const share = new Intl.NumberFormat(undefined, {
	style: 'percent', maximumSignificantDigits: 3,
});
const day = new Intl.DateTimeFormat(undefined, {
	day: 'numeric', month: 'short', year: 'numeric',
});

/** One medal on the profile, lit when held; a hidden one shows only its name until then. */
export default function ProfileMedal({ medal, unlockedAt, progress, holders, players }: {
	medal: MedalDef,
	unlockedAt?: number,
	progress?: { value: number, current: number, goal: number },
	holders: number,
	players: number,
}) {
	const locked = unlockedAt === undefined;
	const hidden = locked && medal.category === 'secret';
	const icon = hidden
		? <span className='profile-medal__hidden'>?</span>
		: <MedalIcon look={medalLook(medal)} />;
	return <div className={`profile-medal ${locked ? 'is-locked' : ''}`}>
		{icon}
		<MedalTip medal={medal} icon={icon} hidden={hidden}>
			<div className='profile-medal__foot'>
				<div className='profile-medal__rarity'>
					<Trans>{ph({ holders: holders.toLocaleString() })} players ({ph({ share: share.format(players ? holders / players : 0) })})</Trans>
				</div>
				{locked && progress && <MedalProgressBar {...progress} />}
				{!locked && <div className='profile-medal__date'>
					<Trans>Achieved on {ph({ date: day.format(unlockedAt) })}</Trans>
				</div>}
			</div>
		</MedalTip>
	</div>;
}

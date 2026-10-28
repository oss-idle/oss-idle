import { Trans } from '@lingui/react/macro';

import num from '@oss-idle/shared/display/num';
import rank from '@oss-idle/shared/display/rank';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import { xpGivesLevel } from '@oss-idle/shared/xp';

import { getCharacterStats } from '../api/characters';
import { useCurrentCharacter } from '../hooks/useCurrentCharacter';
import Link from './Link';
import ProfilePicture from './ProfilePicture';

/** The signed-in player's character at a glance, on top of the dashboard sidebar. */
export default function DashboardCharacter() {
	const character = useCurrentCharacter();
	const stats = useAsync(() => character && getCharacterStats(character.id), [character]);
	if (!character) return null;
	const overallLevel = xpGivesLevel(Object.values(character.skills)
		.reduce((n, s) => n + s.lifetimeXp, 0)).level;

	return <Link to='/c/$id' params={{ id: String(character.id) }} className='dashboard-character'>
		<ProfilePicture avatarUrl={character.avatarUrl} className='dashboard-character__avatar' />
		<div className='dashboard-character__body'>
			<div className='dashboard-character__name'>{character.name}</div>
			<div className='dashboard-character__stats'>
				<span><Trans>level</Trans> <b>{overallLevel}</b></span>
				{stats && <span><b>{rank(stats.globalRank)}</b></span>}
				{stats && <span><b>{num(Math.round(stats.pp))}</b>pp</span>}
			</div>
		</div>
	</Link>;
}

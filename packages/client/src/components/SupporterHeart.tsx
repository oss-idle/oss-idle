import './SupporterHeart.css';

import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Trans } from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { SITE_URL } from '../globals';
import Auth from '../online/auth';
import { PBE } from '../pbe/pbe';

/** osu!'s main menu heart: full for supporters, empty (a link to the store) for anyone else. */
export default function SupporterHeart() {
	const [user] = useSynced(Auth.user);
	if (user?.supporter) return <div className='supporter-heart'>
		<FontAwesomeIcon icon={faHeart} />
		<div className='supporter-heart__tip'>
			<Trans>You are a supporter.</Trans><br />
			<Trans>Thanks for your generosity!</Trans>
		</div>
	</div>;
	return <a
		className='supporter-heart supporter-heart--off'
		href={`${SITE_URL}/web/${PBE ? 'settings' : 'store'}`}
		target='_blank'
		rel='noreferrer'
	>
		<FontAwesomeIcon icon={faHeart} />
		<div className='supporter-heart__tip'>
			{PBE
				? 'Turn on oss!supporter in the web settings'
				: <Trans>Support the game to access cool features!</Trans>}
		</div>
	</a>;
}

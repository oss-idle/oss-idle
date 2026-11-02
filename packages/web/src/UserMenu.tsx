import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
} from 'react';

import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';

import CharacterSwitcher from './CharacterSwitcher';
import Link from './components/Link';
import { useCurrentCharacter } from './hooks/useCurrentCharacter';
import { useCurrentUser } from './hooks/useCurrentUser';
import { Asset } from './router';

/** The header's avatar and its menu. A restricted account's avatar is marked, like osu!web's. */
export default function UserMenu({ open, onOpenChange, onOpen }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpen: () => void;
}) {
	const user = useCurrentUser();
	const character = useCurrentCharacter();
	const avatar = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: PointerEvent) => {
			const target = event.target;
			if (!avatar.current || !(target instanceof Node)) return;
			if (avatar.current.contains(target)) return;
			onOpenChange(false);
		};
		document.addEventListener('pointerdown', handleClickOutside, true);
		return () => document.removeEventListener('pointerdown', handleClickOutside, true);
	}, [onOpenChange]);

	return <div
		ref={avatar}
		className={`topbar__avatar ${open ? 'active' : ''}`}
		data-restricted={user?.restricted}
		style={{ backgroundImage: `url(${Asset(user?.avatarUrl ? user.avatarUrl : GUEST_AVATAR_URL)})` }}
		onClick={e => {
			onOpen();
			onOpenChange(e.target === avatar.current ? !open : true);
		}}
	>
		{open && <div className='usermenu'>
			<div className='usermenu_profile'>{user?.username ?? 'Guest'}</div>
			{user && <CharacterSwitcher />}
			<div className='usermenu_links'>
				{user && <>
					{character && <Link to='/c/$id' params={{ id: String(character.id) }} className='usermenu__link'>
						<Trans>My Profile</Trans>
					</Link>}
					<Link to='/bot' className='usermenu__link'><Trans>Your skillset</Trans></Link>
					<Link to='/friends' className='usermenu__link'><Trans>Friends</Trans></Link>
					<Link to='/settings' className='usermenu__link'><Trans>Settings</Trans></Link>
					<Link to='/logout' className='usermenu__link'><Trans>Sign out</Trans></Link>
				</>}
				{!user && <Link to='/login' className='usermenu__link'><Trans>Sign in</Trans></Link>}
			</div>
		</div>}
	</div>;
}

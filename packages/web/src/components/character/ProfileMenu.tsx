import './ProfileMenu.css';

import {
	faBan,
	faEllipsisVertical,
	faHeart,
	faRotateLeft,
	faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import useAsync from '@oss-idle/shared/hooks/useAsync';

import {
	block,
	getRelation,
	unblock,
} from '../../api/social';
import {
	useAdmin,
	useModerator,
} from '../../hooks/useAdmin';
import ProfileMenuDialog, { type ProfileDialog } from './ProfileMenuDialog';
import SanctionItems from './SanctionItems';

/** osu!web's ⋮ menu on someone else's profile: block and report, silence and restrict for the
 *  moderators, account deletion, supporter months and upgrade rollback for admins. */
export default function ProfileMenu({ userId, characterId, name, restricted, sanctionable }: {
	userId: number;
	characterId: number;
	name: string;
	restricted: boolean;
	/** not an admin */
	sanctionable: boolean;
}) {
	const { t } = useLingui();
	const admin = useAdmin();
	const moderator = useModerator() && sanctionable;
	const relation = useAsync(() => getRelation(userId), [userId]);
	const [blocked, setBlocked] = useState<boolean>();
	const [open, setOpen] = useState(false);
	const [dialog, setDialog] = useState<ProfileDialog>();
	const isBlocked = blocked ?? (!!relation && 'blocked' in relation && relation.blocked);

	const toggleBlock = async () => {
		setOpen(false);
		if (isBlocked) await unblock(userId);
		else await block(userId);
		setBlocked(!isBlocked);
	};
	const pick = (d: ProfileDialog) => {
		setOpen(false);
		setDialog(d);
	};

	return (
		<div className='profile-menu'>
			<button
				type='button'
				className='profile-menu__toggle'
				aria-label={t`more`}
				onClick={() => setOpen(!open)}
			>
				<FontAwesomeIcon icon={faEllipsisVertical} />
			</button>
			{open && <div className='profile-menu__away' onClick={() => setOpen(false)} />}
			{open && <div className='profile-menu__items'>
				<button type='button' className='profile-menu__item' onClick={() => void toggleBlock()}>
					<FontAwesomeIcon icon={faBan} />
					{isBlocked ? t`Unblock` : t`Block`}
				</button>
				<button type='button' className='profile-menu__item' onClick={() => pick('report')}>
					<FontAwesomeIcon icon={faTriangleExclamation} />
					{t`Report`}
				</button>
				{moderator && <SanctionItems userId={userId} restricted={restricted} onPick={pick} />}
				{admin && <button type='button' className='profile-menu__item' onClick={() => pick('supporter')}>
					<FontAwesomeIcon icon={faHeart} />
					{t`Give supporter`}
				</button>}
				{admin && <button type='button' className='profile-menu__item' onClick={() => pick('rollback')}>
					<FontAwesomeIcon icon={faRotateLeft} />
					{t`Roll back upgrade`}
				</button>}
			</div>}
			{dialog && <ProfileMenuDialog
				dialog={dialog}
				userId={userId}
				characterId={characterId}
				name={name}
				onClose={() => setDialog(undefined)}
			/>}
		</div>
	);
}

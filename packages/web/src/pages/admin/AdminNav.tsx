import { useLingui } from '@lingui/react/macro';

import Link from '../../components/Link';
import Nav from '../../components/Nav';
import {
	useAdmin,
	useModerator,
} from '../../hooks/useAdmin';
import { useCurrentUser } from '../../hooks/useCurrentUser';

/** The admin pages as tabs; the GMT only gets the moderation ones, a Beatmap Nominator the nomination. */
export default function AdminNav() {
	const { t } = useLingui();
	const admin = useAdmin();
	const moderator = useModerator();
	const nominator = !!useCurrentUser()?.nominates.length;
	const tab = {
		className: 'nav__item', activeProps: { className: 'current' }, 
	} as const;

	return <Nav>
		{admin && <Link to='/admin' activeOptions={{ exact: true }} {...tab}>{t`dashboard`}</Link>}
		{admin && <Link to='/admin/versions' {...tab}>{t`version adoption`}</Link>}
		{moderator && <Link to='/admin/chat' {...tab}>{t`chat console`}</Link>}
		{moderator && <Link to='/admin/emoji' {...tab}>{t`emoji`}</Link>}
		{admin && <Link to='/admin/bugs' {...tab}>{t`bug reports`}</Link>}
		{(admin || nominator) && <Link to='/admin/nomination' {...tab}>{t`map nomination`}</Link>}
		{admin && <>
			<Link to='/admin/xp' {...tab}>{t`XP gains`}</Link>
			<Link to='/admin/addons' {...tab}>{t`add-ons`}</Link>
			<Link to='/admin/skins' {...tab}>{t`skins`}</Link>
			<Link to='/admin/medals' {...tab}>{t`medals`}</Link>
			<Link to='/admin/orders' {...tab}>{t`supporter orders`}</Link>
		</>}
		{moderator && <Link to='/admin/restrictions' {...tab}>{t`restricted accounts`}</Link>}
		{admin && <Link to='/admin/team' {...tab}>{t`team`}</Link>}
	</Nav>;
}

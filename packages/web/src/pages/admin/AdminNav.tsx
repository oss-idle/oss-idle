import { useLingui } from '@lingui/react/macro';

import Link from '../../components/Link';
import Nav from '../../components/Nav';
import { useAdmin } from '../../hooks/useAdmin';

/** The admin pages as tabs; the GMT only gets the moderation ones. */
export default function AdminNav() {
	const { t } = useLingui();
	const admin = useAdmin();
	const tab = {
		className: 'nav__item', activeProps: { className: 'current' }, 
	} as const;

	return <Nav>
		{admin && <Link to='/admin' activeOptions={{ exact: true }} {...tab}>{t`dashboard`}</Link>}
		{admin && <Link to='/admin/versions' {...tab}>{t`version adoption`}</Link>}
		<Link to='/admin/chat' {...tab}>{t`chat console`}</Link>
		<Link to='/admin/emoji' {...tab}>{t`emoji`}</Link>
		{admin && <Link to='/admin/bugs' {...tab}>{t`bug reports`}</Link>}
		{admin && <>
			<Link to='/admin/xp' {...tab}>{t`XP gains`}</Link>
			<Link to='/admin/nomination' {...tab}>{t`map nomination`}</Link>
			<Link to='/admin/claims' {...tab}>{t`map claims`}</Link>
			<Link to='/admin/addons' {...tab}>{t`add-ons`}</Link>
			<Link to='/admin/skins' {...tab}>{t`skins`}</Link>
			<Link to='/admin/medals' {...tab}>{t`medals`}</Link>
			<Link to='/admin/orders' {...tab}>{t`supporter orders`}</Link>
		</>}
		<Link to='/admin/restrictions' {...tab}>{t`restricted accounts`}</Link>
		{admin && <Link to='/admin/team' {...tab}>{t`team`}</Link>}
	</Nav>;
}

import { useLingui } from '@lingui/react/macro';

import Link from './components/Link';
import {
	useAdmin,
	useModerator,
} from './hooks/useAdmin';
import { useCurrentUser } from './hooks/useCurrentUser';
import { PBE } from './pbe/pbe';

type Props = {
	open: boolean;
	onNavigate: () => void;
	showSub: {
		onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
		onMouseLeave: () => void;
	};
};

export default function HeaderLinks({ open, onNavigate, showSub }: Props) {
	const { t } = useLingui();
	const admin = useAdmin();
	const moderator = useModerator();
	const nominator = !!useCurrentUser()?.nominates.length;

	return (
		<div
			className={`topbar__links ${open ? 'open' : ''}`}
			onClick={e => (e.target as Element).closest('a') && onNavigate()}
		>
			<div className="topbar__link regular" {...showSub}>
				<Link to='/' className="topbar__link-anchor"><span>{t`home`}</span></Link>
				<div className='topbar__sub'>
					<Link to='/news' className="topbar__sublink"><span>{t`news`}</span></Link>
					<Link to='/changelog' className="topbar__sublink"><span>{t`changelog`}</span></Link>
					<Link to='/download' className="topbar__sublink"><span>{t`play oss!idle`}</span></Link>
				</div>
			</div>

			<div className="topbar__link regular" {...showSub}>
				<Link to='/maps' className="topbar__link-anchor"><span>{t`beatmaps`}</span></Link>
				<div className='topbar__sub'>
					<Link to='/maps' className="topbar__sublink"><span>{t`beatmap listing`}</span></Link>
					<Link to='/maps/requests' className="topbar__sublink"><span>{t`map requests`}</span></Link>
				</div>
			</div>

			<div className="topbar__link regular" {...showSub}>
				<Link to='/rankings/global' search={{ page: 1 }} className="topbar__link-anchor">
					<span>{t`rankings`}</span>
				</Link>
				<div className='topbar__sub'>
					<Link to='/rankings/global' search={{ page: 1 }} className="topbar__sublink">
						<span>{t`global`}</span>
					</Link>
					<Link
						to='/rankings/skills/$skill'
						params={{ skill: 'overall' }}
						search={{ page: 1 }}
						className="topbar__sublink"
					>
						<span>{t`skills`}</span>
					</Link>
					<Link to='/rankings/country' search={{ page: 1 }} className="topbar__sublink">
						<span>{t`country`}</span>
					</Link>
				</div>
			</div>

			{!PBE && <div className="topbar__link regular" {...showSub}>
				<Link to='/store' className="topbar__link-anchor"><span>{t`store`}</span></Link>
			</div>}

			<div className="topbar__link regular" {...showSub}>
				<Link to='/help/faq' className="topbar__link-anchor"><span>{t`help`}</span></Link>
				<div className='topbar__sub'>
					<Link to='/help/faq' className="topbar__sublink"><span>{t`faq`}</span></Link>
				</div>
			</div>

			{(moderator || nominator) && (
				<div className="topbar__link regular">
					<Link
						to={admin ? '/admin' : moderator ? '/admin/chat' : '/admin/nomination'}
						className="topbar__link-anchor"
					>
						<span>{t`admin`}</span>
					</Link>
				</div>
			)}
		</div>
	);
}

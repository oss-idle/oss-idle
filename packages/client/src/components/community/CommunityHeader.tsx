import './CommunityHeader.css';

import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import { countryName } from '@oss-idle/shared/display/country';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import Account from '../../online/account';
import Socket from '../../online/socket';
import Dropdown from '../dropdown/Dropdown';
import MusicControls from './MusicControls';
import RosterRulesets from './RosterRulesets';
import {
	activeFilter,
	FILTER,
	searchQuery,
} from './state';

/** The overlay's top bar: title + online count, roster filter + search, and the
 *  now-playing music controls. */
export default function CommunityHeader() {
	const { t, i18n } = useLingui();
	const [online = 0] = useSynced(Socket.online);
	const [search] = useSynced(searchQuery);
	const [account] = useSynced(Account.character);

	const country = account?.country;
	const filterOptions = [
		{
			value: FILTER.all, label: t`All`, 
		},
		{
			value: FILTER.friends, label: t`Friends`, 
		},
		...(country ? [{
			value: FILTER.country, label: countryName(country, i18n.locale), 
		}] : []),
	];

	return (
		<header className="community-header">
			<div className="community-header__title">
				<span className="community-header__brand">oss!idle</span>
				<span className="community-header__online">{t`${plural(ph({ online }), {
					one: '# user connected',
					other: '# users connected',
				})}`}</span>
			</div>

			<div className="community-header__filters">
				<div className='cols'>
					<span><Trans>Filter:</Trans></span>
					<span><Trans id={'search_verb'} comment={'to search (verb)'}>Search:</Trans></span>
				</div>
				<div className='cols right'>
					<Dropdown
						value={activeFilter}
						options={filterOptions}
						accent="var(--osu-pink)"
					/>
					<input
						className="community-header__search"
						type="text"
						placeholder={t`Search`}
						value={search}
						onChange={e => void searchQuery.set(e.target.value)}
					/>
				</div>
			</div>

			<RosterRulesets />

			<MusicControls />
		</header>
	);
}

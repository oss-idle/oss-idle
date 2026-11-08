import { t } from '@lingui/core/macro';

import { countryName } from '@oss-idle/shared/display/country';
import type { BoardSort } from '@oss-idle/shared/rankings';

import {
	SCORE_TAB,
	ScoreTab,
	SETTINGS,
} from '../../db/settings';
import { message } from '../../globals';
import { i18n } from '../../i18n';
import Dropdown, { DropdownOption } from '../dropdown/Dropdown';

/** Local, the current character's, Friends (oss!supporter), the signed-in player's
 *  own country, Global and Global at the rate the map plays at. */
const tabOptions = (country?: string, supporter?: boolean): DropdownOption<ScoreTab>[] => [
	{
		value: SCORE_TAB.LOCAL, label: 'Local', 
	},
	{
		value: SCORE_TAB.MINE, label: 'Mine', 
	},
	{
		value: SCORE_TAB.FRIENDS,
		label: 'Friends',
		locked: supporter
			? undefined
			: () => void message.set(t`Friend rankings are an oss!supporter feature`),
	},
	...(country ? [{
		value: SCORE_TAB.COUNTRY, 
		label: countryName(country, i18n.locale), 
	}] : []),
	{
		value: SCORE_TAB.GLOBAL, label: 'Global', 
	},
	{
		value: SCORE_TAB.RATE, label: 'Current rate',
	},
];

const sortOptions: DropdownOption<BoardSort>[] = [
	{
		value: 'score', label: 'By Score',
	},
	{
		value: 'pp', label: 'By Performance',
	},
];

/** Song select's leaderboard tab and its order, side by side. */
export default function LeaderboardFilters({ country, supporter }: {
	country?: string,
	supporter?: boolean,
}) {
	return (
		<div className="lb__filters">
			<Dropdown 
				className="lb__select" 
				value={SETTINGS.leaderboard} 
				options={tabOptions(country, supporter)} 
			/>
			<Dropdown
				className="lb__select"
				value={SETTINGS.leaderboardSort}
				options={sortOptions}
			/>
		</div>
	);
}

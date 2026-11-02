import { useLingui } from '@lingui/react/macro';

import { countryName } from '@oss-idle/shared/display/country';
import useAsync from '@oss-idle/shared/hooks/useAsync';

import { getCountries } from '../../api/rankings';
import { i18n } from '../../i18n';
import LeaderboardFilters from './LeaderboardFilters';
import { useBoardRuleset } from './useBoardRuleset';
import { useFriendsFilter } from './useFriendsFilter';

/** The shared "select a country" filter for the public leaderboards, with the
 *  friends switch beside it. Pulls the live country list from the server so it
 *  stays in sync as players join. The empty value means "All". */
export default function CountryFilter({ selected, onSelect }: {
	selected?: string,
	onSelect: (country: string) => void,
}) {
	const { t } = useLingui();
	const ruleset = useBoardRuleset();
	const countries = useAsync(() => getCountries(ruleset), [ruleset]);

	const items = [
		{
			label: t`All`, value: '', 
		},
		...(countries ?? []).map(c => ({
			label: countryName(c.country, i18n.locale), value: c.country, 
		})),
	];

	const friends = useFriendsFilter();
	return <LeaderboardFilters filters={[
		{
			label: t`country`,
			type: 'select',
			items,
			selected: selected ?? '',
			onSelection: item => onSelect(item.value),
		},
		...friends ? [friends] : [],
	]} />;
}

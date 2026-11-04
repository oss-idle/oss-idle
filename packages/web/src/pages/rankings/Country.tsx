import '../../components/leaderboard/PlayerLeaderboard.css';

import { Trans } from '@lingui/react/macro';

import accuracy from '@oss-idle/shared/display/accuracy';
import BigNum from '@oss-idle/shared/display/BigNum';
import { countryName } from '@oss-idle/shared/display/country';
import num, { bignum } from '@oss-idle/shared/display/num';
import rank from '@oss-idle/shared/display/rank';
import { PAGE_SIZE } from '@oss-idle/shared/rankings';
import hitAccuracy from '@oss-idle/shared/rulesets/mania/hitAccuracy';
import { countsOf } from '@oss-idle/shared/rulesets/ruleset';

import type { getCountryRanking } from '../../api/rankings';
import Flag from '../../components/Flag';
import Pager from '../../components/leaderboard/Pager';
import Link from '../../components/Link';
import { i18n } from '../../i18n';
import RankingsNav from './RankingsNav';

type Countries = Awaited<ReturnType<typeof getCountryRanking>>;

export default function CountryRankings({ page, countries }: {
	page: number,
	countries: Countries,
}) {
	return (
		<main>
			<RankingsNav current={'country'} />
			<div className='page-contents'>
				<div className='player__lb_scroll'>
					<table className='player__lb_listing'>
						<thead>
							<tr>
								<th></th>
								<th></th>
								<th><Trans>Active Players</Trans></th>
								<th><Trans>Play Count</Trans></th>
								<th><Trans>Accuracy</Trans></th>
								<th><Trans>Ranked Score</Trans></th>
								<th><Trans>Avg. Performance</Trans></th>
								<th className='current'><Trans>Performance</Trans></th>
							</tr>
						</thead>
						<tbody>
							{countries.map((country, r) => <tr key={country.country}>
								<td>{rank(r + 1 + ((page - 1) * PAGE_SIZE))}</td>
								<td className='main'><div className='player__lb_listing_main'>
									<Flag country={country.country} />
									<Link to='/rankings/global' search={{
										page: 1, country: country.country,
									}}>{countryName(country.country, i18n.locale)}</Link>
								</div></td>
								<td className='dimmed'>{bignum(country.players)}</td>
								<td className='dimmed'><BigNum value={country.playCount} theme='ocean' /></td>
								<td className='dimmed'>{accuracy(hitAccuracy(countsOf(country)))}</td>
								<td className='dimmed'>{num(country.rankedScore)}</td>
								<td className='dimmed'>
									{num(Math.round(country.pp / country.players))}
								</td>
								<td className='current'>{num(Math.round(country.pp))}</td>
							</tr>)}
						</tbody>
					</table>
				</div>
				<Pager page={page} hasNext={countries.length === PAGE_SIZE} />
			</div>
		</main>
	);
}

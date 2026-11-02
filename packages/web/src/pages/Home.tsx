import './Home.css';

import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight';
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { dateAgo } from '@oss-idle/shared/display/ago';
import num from '@oss-idle/shared/display/num';

import {
	coverBackground,
	type getRecentMaps,
} from '../api/maps';
import type { listNews } from '../api/news';
import type {
	getGeneralStats,
	getRecentStats,
} from '../api/stats';
import DashboardCharacter from '../components/DashboardCharacter';
import FancyGraph from '../components/FancyGraph';
import HomeButton from '../components/HomeButton';
import Link from '../components/Link';
import NewsCard, { articleToCard } from '../components/NewsCard';
import NewsRow from '../components/NewsRow';
import { PBE } from '../pbe/pbe';

// osu!web's NewsPost::LANDING_LIMIT and DASHBOARD_LIMIT
const LARGE_NEWS = 4;
const DASHBOARD_NEWS = 8;

export default function Home({ articles, stats, recent, recentMaps }: {
	articles: Awaited<ReturnType<typeof listNews>>,
	stats: Awaited<ReturnType<typeof getGeneralStats>>,
	recent: Awaited<ReturnType<typeof getRecentStats>>,
	recentMaps: Awaited<ReturnType<typeof getRecentMaps>>,
}) {
	return (
		<main className="dashboard">
			<section className="dashboard__left">
				<h2 className="dashboard__title"><Trans>News</Trans></h2>
				{articles.slice(0, LARGE_NEWS).map(a => (
					<NewsCard key={a.id} {...articleToCard(a)} className='home-news' />
				))}
				{articles.length > LARGE_NEWS && <div className='dashboard__news-group'>
					{articles.slice(LARGE_NEWS, DASHBOARD_NEWS).map(a => <NewsRow key={a.id} article={a} />)}
				</div>}
				<Link to='/news' className='dashboard__news-group dashboard__news-more'>
					<Trans>See more</Trans>
				</Link>
			</section>
			<section className="dashboard__right">
				<div className='dashboard__stats'>
					<div className='dashboard__stats_n'>
						<div className='dashboard__stats_g'>
							<div className='dashboard__stats_g-title'><Trans>Online Users</Trans></div>
							<div className='dashboard__stats_g-num'>{num(stats.online)}</div>
						</div>
						<div className='dashboard__stats_g'>
							<div className='dashboard__stats_g-title'><Trans>Playing</Trans></div>
							<div className='dashboard__stats_g-num'>{num(stats.playing)}</div>
						</div>

					</div>
					{recent.online_hist.length > 0 && (
						<FancyGraph data={recent.online_hist} />
					)}
				</div>
				<div className='dashboard__buttons'>
					<DashboardCharacter />
					<HomeButton to='/download' icon={faDownload} hue={274}>
						<Trans>download oss!idle</Trans>
					</HomeButton>
					{!PBE && <HomeButton to='/store' icon={faHeart} hue={340}>
						<Trans>support the game</Trans>
					</HomeButton>}
				</div>
				<div className='dashboard__ranked'>
					<div className='dashboard__ranked_title'>
						<Trans>New Ranked Beatmaps</Trans>
					</div>
					<div className='dashboard__ranked_list'>
						{recentMaps.map(map => (<Link
							key={map.id}
							to='/maps/$id'
							params={{ id: String(map.id) }}
							className='dashboard__ranked_list_map'
						>
							<div
								className='dashboard__ranked_list_map-bg'
								style={{ backgroundImage: coverBackground(map, 'list') }}
							></div>
							<div className='dashboard__ranked_list_map-md'>
								<div className='dashboard__ranked_list_map-md-title'>{map.title}</div>
								<div className='dashboard__ranked_list_map-md-artist'>{map.artist}</div>
								<div className='dashboard__ranked_list_map-md-info'>
									<div className='dashboard__ranked_list_map-md-info-c'>
										<Trans>by {ph({ creator: map.creator })}</Trans>
									</div>
									<div className='dashboard__ranked_list_map-md-info-d'>{dateAgo(map.rankedAt)}</div>
								</div>
							</div>
							<div className='dashboard__ranked_list_map-c'>
								<FontAwesomeIcon icon={faChevronRight} />
							</div>
						</Link>))}
						<Link to='/maps'><Trans>See more</Trans></Link>
					</div>
				</div>
			</section>
		</main>
	);
}

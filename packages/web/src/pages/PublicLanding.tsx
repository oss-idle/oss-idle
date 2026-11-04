import './PublicLanding.css';

import { faDiscord } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import { bignum } from '@oss-idle/shared/display/num';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import { DISCORD_URL } from '@oss-idle/shared/links';
import type { NewsDTO } from '@oss-idle/shared/news';

import { listNews } from '../api/news';
import { getGeneralStats } from '../api/stats';
import { loginWithOsu } from '../auth';
import Link from '../components/Link';
import NewsCard, { articleToCard } from '../components/NewsCard';
import Footer from '../Footer';
import LocaleMenu from '../LocaleMenu';
import { Asset } from '../router';

const formatCount = (n: number): string => bignum(n);

export default function PublicLanding() {
	const { t } = useLingui();

	const [articles, setArticles] = useState<NewsDTO[] | null>(null);
	useEffect(() => {
		listNews().then(setArticles).catch(() => setArticles([]));
	}, []);
	const live = articles && articles.length > 0 ? articles.slice(0, 3) : null;
	const stats = useAsync(getGeneralStats, []);

	const STATS = [
		{
			label: t`scores set`, value: stats?.scores ?? 0, 
		},
		{
			label: t`characters`, value: stats?.users ?? 0, 
		},
		{
			label: t`online now`, value: stats?.online ?? 0, 
		},
		{
			label: t`playing now`, value: stats?.playing ?? 0, 
		},
	] as const;

	return (
		<div className="landing">
			<div className="landing__glow" aria-hidden="true" />

			<header className="landing__topbar">
				<div className="landing__brand">
					<span className="landing__brand-logo" />
					<span className="landing__brand-name">oss!<b>idle</b></span>
				</div>
				<nav className="landing__sections">
					<Link to='/maps'>{t`beatmaps`}</Link>
					<Link to='/rankings/global' search={{ page: 1 }}>{t`rankings`}</Link>
					<Link to='/news'>{t`news`}</Link>
					<Link to='/help/faq'>{t`help`}</Link>
				</nav>
				<nav className="landing__topnav">
					<a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="landing__topnav-link">
						<FontAwesomeIcon icon={faDiscord} />
					</a>
					<LocaleMenu />
					<button type="button" className="landing__signin" onClick={loginWithOsu}>
						<Trans>Sign in</Trans>
					</button>
				</nav>
			</header>

			<section className="hero">
				<video
					className="hero__video"
					src={Asset('/intro.mp4')}
					autoPlay
					muted
					loop
					playsInline
				/>
				<div className="hero__scrim" aria-hidden="true" />

				<div className="hero__content">
					<div className="hero__logo">
						<img className="hero__logo-back" src={Asset('/idle-back.png')} alt="" aria-hidden="true" />
						<img className="hero__logo-front" src={Asset('/idle-white.png')} alt="oss!idle" />
					</div>
					<h1 className="hero__title"><Trans>The ultimate<br/>VSRG idle game</Trans></h1>
					<p className="hero__tagline">
						<Trans>Create your own oss! character and watch it grow to become a<br /><b>legendary mania player</b>.</Trans>
					</p>
					<div className="hero__cta">
						<button type="button" className="btn-osu" onClick={loginWithOsu}>
							<img src={Asset('/idle.png')} alt="" aria-hidden="true" />
							<Trans>Sign in with osu!</Trans>
						</button>
						<a className="btn-ghost" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
							<Trans>Join the community</Trans>
						</a>
					</div>

					<ul className="stats">
						{STATS.map(s => (
							<li key={s.label} className="stats__item">
								<span className="stats__value">{formatCount(s.value)}</span>
								<span className="stats__label">{s.label}</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section className="news">
				<div className="news__head">
					<h2 className="news__heading"><Trans>Latest news</Trans></h2>
					<Link to="/news" className="news__all"><Trans>View all</Trans> →</Link>
				</div>
				<div className="news-grid">
					{live && live.map(a => <NewsCard key={a.id} {...articleToCard(a)} />)}
					{!live && t`No news yet. Check back soon!`}
				</div>
			</section>

			<Footer />
		</div>
	);
}

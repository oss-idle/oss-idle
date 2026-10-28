import './Dashboard.css';
import './dashboard/TimeChart.css';

import {
	useEffect,
	useState,
} from 'react';

import {
	type AdminMetrics,
	type AdminStats,
	getAdminMetrics,
	getAdminStats,
} from '../../api/admin';
import Activity from './dashboard/Activity';
import ApiTraffic from './dashboard/ApiTraffic';
import {
	fullIn,
	ms,
	pct,
} from './dashboard/format';
import { serverName } from './dashboard/hosts';
import PlayerLatency from './dashboard/PlayerLatency';
import ServiceHealth from './dashboard/ServiceHealth';
import SystemLoad from './dashboard/SystemLoad';

const STATS_MS = 10_000;
const METRICS_MS = 30_000;

/** Poll `load` every `every` ms while mounted. */
const usePolled = <T,>(load: () => Promise<T>, every: number) => {
	const [value, setValue] = useState<T>();
	const [error, setError] = useState<string>();
	useEffect(() => {
		let alive = true;
		const run = () => load()
			.then(v => { if (alive) { setValue(v); setError(undefined); } })
			.catch((e: Error) => { if (alive) setError(e.message); });
		void run();
		const id = setInterval(run, every);
		return () => { alive = false; clearInterval(id); };
	}, []);
	return [value, error] as const;
};

const tiles = (stats: AdminStats, metrics: AdminMetrics | undefined) => {
	const now = [
		{
			label: 'Server version', value: stats.serverVersion,
		},
		{
			label: 'Play simulation', value: `${stats.sim.name} ${stats.sim.version}`,
		},
		{
			label: 'Online / game open now',
			value: `${stats.online.toLocaleString()} / ${stats.clients.toLocaleString()}`,
		},
		{
			label: 'Playing now', value: stats.playing.toLocaleString(),
		},
		{
			label: 'Players', value: stats.players.toLocaleString(),
		},
		{
			label: 'Guests now / total',
			value: `${stats.guests.toLocaleString()} / ${stats.guestsTotal.toLocaleString()}`,
		},
		{
			label: 'Scores', value: stats.scores.toLocaleString(),
		},
	];
	if (!metrics) return now;
	const days = Object.values(metrics.http).map(h => h.day);
	const requests = days.reduce((n, d) => n + d.n, 0);
	const fives = days.reduce((n, d) => n + d.s5, 0);
	const up = metrics.probes.filter(p => p.last.ok).length;
	return [
		...now,
		{
			label: 'API requests, 24 h', value: requests.toLocaleString(),
		},
		{
			label: 'Server errors, 24 h', value: pct(requests ? fives / requests : undefined, 2),
		},
		{
			label: 'API p95 (direct), 24 h', value: ms(metrics.http.direct?.day.p95),
		},
		{
			label: 'Services up', value: `${up} / ${metrics.probes.length}`,
		},
		{
			label: 'Disk full in', value: fullIn(metrics.disk),
		},
		...Object.entries(metrics.rtt).map(([host, r], i) => ({
			label: `Players' round trip, ${serverName(host, i).split(' (')[0]}`,
			value: ms(r.overall.day.p50),
		})),
	];
};

/** Everything about prod over the last day: players' latency, the API, every service, activity, load. */
export default function Dashboard() {
	const [stats, statsError] = usePolled(getAdminStats, STATS_MS);
	const [metrics, metricsError] = usePolled(getAdminMetrics, METRICS_MS);

	if (statsError) {
		return <main className='admin-dashboard'>
			<p className='admin-dashboard__error'>{statsError}</p>
		</main>;
	}
	if (!stats) {
		return <main className='admin-dashboard'>
			<p className='admin-dashboard__muted'>Loading…</p>
		</main>;
	}

	return (
		<main className='admin-dashboard'>
			<div className='admin-dashboard__cards'>
				{tiles(stats, metrics).map(card => (
					<div key={card.label} className='admin-dashboard__card'>
						<span className='admin-dashboard__card-value'>{card.value}</span>
						<span className='admin-dashboard__card-label'>{card.label}</span>
					</div>
				))}
			</div>
			{metricsError && <p className='admin-dashboard__error'>Metrics: {metricsError}</p>}
			{metrics && <>
				<ServiceHealth metrics={metrics} />
				<PlayerLatency metrics={metrics} />
				<ApiTraffic metrics={metrics} />
				<Activity metrics={metrics} />
				<SystemLoad metrics={metrics} />
			</>}
		</main>
	);
}

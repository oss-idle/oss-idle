import '../Dashboard.css';
import '../dashboard/TimeChart.css';
import './XpGains.css';

import {
	useEffect,
	useState,
} from 'react';

import { getAdminXpGains } from '../../../api/admin';
import {
	bandsOf,
	type XpBands,
} from './bands';
import BestView from './BestView';
import HeatmapView from './HeatmapView';
import ParityView from './ParityView';
import SkillMultiples from './SkillMultiples';

const VIEWS = {
	table: {
		name: 'XP per play', View: HeatmapView, 
	},
	skills: {
		name: 'by skill', View: SkillMultiples,
	},
	parity: {
		name: 'vs accuracy', View: ParityView, 
	},
} as const;
type View = keyof typeof VIEWS | 'best';

const WINDOWS = [
	{
		days: 1, name: 'today', 
	},
	{
		days: 7, name: 'last 7 days', 
	},
	{
		days: 30, name: 'last 30 days', 
	},
	{
		days: undefined, name: 'all recorded', 
	},
];

/** Raw strain XP per paying play, by the level each skill played at: the skills' balance as players live it. */
export default function XpGains() {
	const [view, setView] = useState<View>('table');
	const [days, setDays] = useState<number>();
	const [data, setData] = useState<XpBands>();
	const [error, setError] = useState<string>();

	useEffect(() => {
		let live = true;
		setData(undefined);
		getAdminXpGains(days)
			.then(gains => live && setData(bandsOf(gains)))
			.catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			live = false;
		};
	}, [days]);

	const empty = data && !data.bands.some(b => b.cells.some(c => c.plays));
	const View = view === 'best' ? undefined : VIEWS[view].View;
	return (
		<div className='admin-dashboard xp-gains'>
			<h1 className='admin-dashboard__title'>XP gains</h1>
			<p className='admin-dashboard__muted xp-gains__note'>
				Each paying play's raw strain XP, before any upgrade, prestige, mod or other multiplier.
				It counts in each skill's band at the level that skill played at (prestige and lifetime
				XP included), not its XP level: 10-level bands up to 99, then one per level.
			</p>
			<div className='xp-gains__filters'>
				<nav className='xp-gains__tabs'>
					{(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map(k => (
						<button
							key={k}
							type='button'
							className={k === view ? 'xp-gains__tab active' : 'xp-gains__tab'}
							onClick={() => setView(k)}
						>{VIEWS[k].name}</button>
					))}
					<button
						type='button'
						className={view === 'best' ? 'xp-gains__tab active' : 'xp-gains__tab'}
						onClick={() => setView('best')}
					>best maps</button>
				</nav>
				{view !== 'best' && <label className='xp-gains__filter'>
					plays
					<select
						value={days ?? 'all'}
						onChange={e => setDays(e.target.value === 'all' ? undefined : Number(e.target.value))}
					>
						{WINDOWS.map(w => <option key={w.name} value={w.days ?? 'all'}>{w.name}</option>)}
					</select>
				</label>}
			</div>
			{view === 'best' ? <BestView /> : <>
				{error && <p className='admin-dashboard__error'>{error}</p>}
				{!error && !data && <p className='admin-dashboard__muted'>Loading…</p>}
				{empty && <p className='admin-dashboard__muted'>No paying plays recorded in this window.</p>}
				{View && data && !empty && <View data={data} />}
			</>}
		</div>
	);
}

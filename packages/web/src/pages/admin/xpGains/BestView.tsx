import {
	useEffect,
	useMemo,
	useState,
} from 'react';

import { skillName } from '@oss-idle/shared/rulesets/mania/4k/display';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';

import {
	type AdminXpGainBest,
	getAdminXpGainBest,
} from '../../../api/admin';
import BestTipBody from './BestTipBody';
import CellTip, { type Tip } from './CellTip';
import {
	compact,
	diverging,
	inkOnRatio,
} from './scales';

const MIN_PLAYS = [1, 3, 10];
/** Under this many maps a band's weighted pay rests on too few to trust. */
const FEW_MAPS = 10;

const median = (values: number[]) => {
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Each skill's XP per play on its best maps, per band, like osu! weighs a player's
 *  best scores: what a skill really pays when it is farmed, whatever the corpus. */
export default function BestView() {
	const [min, setMin] = useState(3);
	const [data, setData] = useState<AdminXpGainBest>();
	const [error, setError] = useState<string>();
	const [tip, setTip] = useState<Tip>();

	useEffect(() => {
		let live = true;
		setData(undefined);
		getAdminXpGainBest(min)
			.then(best => live && setData(best))
			.catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			live = false;
		};
	}, [min]);

	const bands = useMemo(() => {
		if (!data) return [];
		const rows = new Map<number, Map<string, AdminXpGainBest['cells'][number]>>();
		for (const cell of data.cells) {
			rows.set(cell.band, (rows.get(cell.band) ?? new Map()).set(cell.skill, cell));
		}
		return [...rows.entries()].toSorted(([a], [b]) => a - b).map(([band, cells]) => ({
			band, cells, median: median([...cells.values()].map(c => c.perPlay)),
		}));
	}, [data]);

	return <>
		<p className='xp-gains__lede'>
			Each skill's XP per play on its best maps in the band, weighted like osu! weighs your best
			scores (100%, 95%, 90%… over up to 100 maps), so the many maps that barely pay a skill don't
			drag it down. Coloured against the band's median skill: red pays more, blue less. Hatched
			cells rest on under {FEW_MAPS} maps; hover for the best ones.
		</p>
		<label className='xp-gains__filter'>
			count a map from
			<select value={min} onChange={e => setMin(Number(e.target.value))}>
				{MIN_PLAYS.map(n => <option key={n} value={n}>{n} plays</option>)}
			</select>
		</label>
		{error && <p className='admin-dashboard__error'>{error}</p>}
		{!error && !data && <p className='admin-dashboard__muted'>Loading…</p>}
		{data && !bands.length && <p className='admin-dashboard__muted'>No map has that many plays yet.</p>}
		{data && bands.length > 0 && <div className='xp-gains__grid-wrap'>
			<table className='xp-gains__grid' onPointerLeave={() => setTip(undefined)}>
				<thead>
					<tr>
						<th className='xp-gains__band'>level</th>
						{data.skills.map(s => <th key={s}>{skillName(s as SkillName)}</th>)}
					</tr>
				</thead>
				<tbody>
					{bands.map(row => <tr key={row.band}>
						<th className='xp-gains__band'>{row.band < 100 ? `${row.band}–${row.band + 9}` : row.band}</th>
						{data.skills.map(skill => {
							const cell = row.cells.get(skill);
							const ratio = cell && row.median > 0 ? cell.perPlay / row.median : undefined;
							return <td
								key={skill}
								className={cell && cell.maps < FEW_MAPS ? 'xp-gains__cell few' : 'xp-gains__cell'}
								style={ratio === undefined ? undefined : {
									background: diverging(ratio), color: inkOnRatio(ratio),
								}}
								onPointerMove={e => cell && setTip({
									x: e.clientX, y: e.clientY, body: <BestTipBody cell={cell} median={row.median} />,
								})}
							>{cell ? compact(cell.perPlay) : '-'}</td>;
						})}
					</tr>)}
				</tbody>
			</table>
			<CellTip tip={tip} />
		</div>}
	</>;
}

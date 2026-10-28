import { useState } from 'react';

import {
	type Band,
	FEW_PLAYS,
	labelOf,
	type XpBands,
} from './bands';
import CellTip, { type Tip } from './CellTip';
import TipBody from './TipBody';

export type CellLook = { background: string, color: string, text: string };

type Props = {
	data: XpBands,
	look: (band: Band, skill: number) => CellLook | undefined,
};

/** Bands down, skills across: a cell per band and skill, hover for its numbers. */
export default function BandGrid({ data, look }: Props) {
	const [tip, setTip] = useState<Tip>();
	return (
		<div className='xp-gains__grid-wrap'>
			<table className='xp-gains__grid' onPointerLeave={() => setTip(undefined)}>
				<thead>
					<tr>
						<th className='xp-gains__band'>level</th>
						{data.skills.map((s, i) => <th key={s}>{labelOf(data, i)}</th>)}
					</tr>
				</thead>
				<tbody>
					{data.bands.map(band => (
						<tr key={band.label}>
							<th className='xp-gains__band'>{band.label}</th>
							{data.skills.map((s, i) => {
								const cell = look(band, i);
								const few = band.cells[i].plays < FEW_PLAYS;
								return (
									<td
										key={s}
										className={few ? 'xp-gains__cell few' : 'xp-gains__cell'}
										style={cell && {
											background: cell.background, color: cell.color,
										}}
										onPointerMove={e => setTip({
											x: e.clientX, y: e.clientY, body: <TipBody data={data} band={band} skill={i} />,
										})}
									>
										{cell?.text ?? '-'}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
			<CellTip tip={tip} />
		</div>
	);
}

import { line } from 'd3-shape';

import {
	accuracyOf,
	type Band,
	FEW_PLAYS,
	labelOf,
	perPlay,
	type XpBands,
} from './bands';
import type { Tip } from './CellTip';
import TipBody from './TipBody';

const W = 320;
const H = 130;
const PAD = {
	top: 6, right: 4, bottom: 16, left: 4,
};

/** The level axis' labels: its ends, and 100 where the bands turn to single levels. */
const TICKS = [
	{
		at: () => 0, anchor: 'start', 
	},
	{
		at: () => 100, anchor: 'middle', 
	},
	{
		at: (max: number) => max - 1, anchor: 'end', 
	},
] as const;

type Props = {
	data: XpBands,
	skill: number,
	/** log10 extremes shared by every panel */
	lo: number,
	hi: number,
	onTip: (tip?: Tip) => void,
};

/** One skill's raw XP per play as a column per band, accuracy's as a line behind. */
export default function MiniBars({
	data, skill, lo, hi, onTip,
}: Props) {
	const accuracy = accuracyOf(data);
	const maxLevel = (data.bands.at(-1)?.to ?? 99) + 1;
	const x = (level: number) => PAD.left + level / maxLevel * (W - PAD.left - PAD.right);
	const plotH = H - PAD.top - PAD.bottom;
	const y = (v: number) =>
		PAD.top + (hi - Math.log10(Math.max(v, 10 ** lo))) / (hi - lo || 1) * plotH;
	const accuracyLine = line<Band>()
		.defined(b => (perPlay(b, accuracy) ?? 0) > 0)
		.x(b => x((b.from + b.to + 1) / 2))
		.y(b => y(perPlay(b, accuracy)!))(data.bands) ?? '';

	return (
		<figure className='xp-gains__multiple'>
			<figcaption>{labelOf(data, skill)}</figcaption>
			<svg viewBox={`0 0 ${W} ${H}`} className='xp-gains__svg' onPointerLeave={() => onTip(undefined)}>
				{data.bands.map(b => {
					const avg = perPlay(b, skill) ?? 0;
					return avg > 0 && (
						<rect
							key={b.label}
							className={b.cells[skill].plays < FEW_PLAYS ? 'xp-gains__bar few' : 'xp-gains__bar'}
							x={x(b.from) + 0.5}
							width={Math.max(1, x(b.to + 1) - x(b.from) - 1)}
							y={y(avg)}
							height={H - PAD.bottom - y(avg)}
							onPointerMove={e => onTip({
								x: e.clientX, y: e.clientY, body: <TipBody data={data} band={b} skill={skill} />,
							})}
						/>
					);
				})}
				{skill !== accuracy && <path d={accuracyLine} className='xp-gains__line accuracy' />}
				{TICKS.map(({ at, anchor }) => (
					<text
						key={anchor}
						className='xp-gains__tick'
						x={x(at(maxLevel))}
						y={H - 3}
						textAnchor={anchor}
					>{at(maxLevel)}</text>
				))}
			</svg>
		</figure>
	);
}

import {
	accuracyOf,
	type Band,
	labelOf,
	perPlay,
	type XpBands,
} from './bands';
import { compact } from './scales';

type Props = { data: XpBands, band: Band, skill: number };

/** What a hovered band says for one skill, against accuracy's pace there. */
export default function TipBody({ data, band, skill }: Props) {
	const avg = perPlay(band, skill);
	const accuracy = accuracyOf(data);
	const acc = perPlay(band, accuracy);
	const { plays, xp } = band.cells[skill];
	return <>
		<span className='xp-gains__tip-head'>{labelOf(data, skill)}, level {band.label}</span>
		<span className='xp-gains__tip-row'>
			XP per play <b>{avg === undefined ? '-' : compact(avg)}</b>
		</span>
		<span className='xp-gains__tip-row'>plays <b>{plays.toLocaleString()}</b></span>
		<span className='xp-gains__tip-row'>total XP <b>{compact(xp)}</b></span>
		{skill !== accuracy && avg !== undefined && acc !== undefined && (
			<span className='xp-gains__tip-row'>vs accuracy <b>×{(avg / acc).toFixed(2)}</b></span>
		)}
	</>;
}

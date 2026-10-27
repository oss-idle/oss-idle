import './PlayHistoryGraph.css';

import { ph } from '@lingui/core/macro';
import {
	Plural,
	useLingui,
} from '@lingui/react/macro';
import { line } from 'd3-shape';
import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import num from '@oss-idle/shared/display/num';
import {
	axisScale,
	monthlySeries,
	type PlayCount,
} from '@oss-idle/shared/display/playCounts';

import { i18n } from '../../i18n';

const SVG_HEIGHT = 246;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 176;
/** Room for the y-axis labels, and on the right for the last rotated label. */
const GUTTER = 48;
const RIGHT = 36;
/** Horizontal room one rotated "Jan 2026" needs, far less than its text width. */
const LABEL_WIDTH = 56;
/** Gap between the plot floor and the top of the rotated labels. */
const LABEL_Y = PLOT_BOTTOM + 26;

const monthLabel = (month: string) =>
	new Date(`${month}-01T00:00:00Z`).toLocaleDateString(i18n.locale, {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});

/** osu!-web style play history: one point per month from the first play to now,
 *  boxed plot, y grid, rotated month ticks and a hover tooltip. */
export default function PlayHistoryGraph({ rows }: { rows: PlayCount[] }) {
	const { t } = useLingui();
	const container = useRef<HTMLDivElement>(null);
	const tooltip = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [tipWidth, setTipWidth] = useState(0);
	const [hover, setHover] = useState<number>();

	useLayoutEffect(() => {
		const el = container.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setWidth(el.clientWidth));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Measured after each render so the tooltip can be kept inside the plot.
	useLayoutEffect(() => {
		const measured = tooltip.current?.offsetWidth ?? 0;
		setTipWidth(current => (current === measured ? current : measured));
	});

	const { counts, dates } = useMemo(() => monthlySeries(rows), [rows]);
	const last = Math.max(counts.length - 1, 0);
	const plotWidth = Math.max(width - GUTTER - RIGHT, 1);
	const xAt = (index: number) => GUTTER + (last > 0 ? (index / last) * plotWidth : plotWidth / 2);

	const { step, top } = useMemo(() => axisScale(Math.max(...counts)), [counts]);
	const yAt = (value: number) =>
		PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);
	const gridValues = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);

	const path = line<{ x: number; y: number }>()
		.x(p => p.x)
		.y(p => p.y)(counts.map((value, index) => ({
			x: xAt(index), y: yAt(value), 
		})));

	// One label per month until they stop fitting, then every 2nd, 3rd, 6th or
	// 12th - divisors of a year, so a decade collapses to bare Januaries.
	const ticks = useMemo(() => {
		const room = Math.max(4, Math.floor(plotWidth / LABEL_WIDTH));
		const every = [1, 2, 3, 6, 12]
			.find(skip => Math.ceil(dates.length / skip) <= room) ?? 12;
		const aligned = dates.flatMap((date, index) => (
			index === 0 || (Number(date.slice(5, 7)) - 1) % every === 0 ? [index] : []
		));
		const stride = Math.ceil(aligned.length / room);
		return aligned
			.filter((_, i) => i % stride === 0)
			.map(index => ({
				index, label: monthLabel(dates[index]),
			}));
	}, [dates, plotWidth]);

	const total = counts.reduce((sum, plays) => sum + plays, 0);
	const months = num(dates.length);
	const summary = t`${ph({ plays: num(total) })} plays in ${ph({ months })} months`;
	const tipX = Math.min(
		Math.max(xAt(hover ?? 0), tipWidth / 2),
		Math.max(width - tipWidth / 2, tipWidth / 2),
	);

	return <div
		ref={container}
		className='play-history'
		role='img'
		aria-label={summary}
		onMouseMove={e => {
			const box = e.currentTarget.getBoundingClientRect();
			const index = Math.round(((e.clientX - box.left - GUTTER) / plotWidth) * last);
			setHover(Math.max(0, Math.min(last, index)));
		}}
		onMouseLeave={() => setHover(undefined)}
	>
		{width > 0 && counts.length > 0 && (
			<svg
				className='play-history__svg'
				width={width}
				height={SVG_HEIGHT}
				viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
			>
				<rect
					className='play-history__frame'
					x={GUTTER}
					y={PLOT_TOP}
					width={plotWidth}
					height={PLOT_BOTTOM - PLOT_TOP}
				/>
				{gridValues.map(value => <g key={value}>
					<line
						className='play-history__grid'
						x1={GUTTER}
						x2={GUTTER + plotWidth}
						y1={yAt(value)}
						y2={yAt(value)}
					/>
					<text
						className='play-history__axis'
						x={GUTTER - 8}
						y={yAt(value) + 4}
						textAnchor='end'
					>{num(value)}</text>
				</g>)}
				{ticks.map(tick => <g key={tick.index}>
					<line
						className='play-history__grid'
						x1={xAt(tick.index)}
						x2={xAt(tick.index)}
						y1={PLOT_TOP}
						y2={PLOT_BOTTOM}
					/>
					<text
						className='play-history__tick'
						x={xAt(tick.index)}
						y={LABEL_Y}
						textAnchor='middle'
						transform={`rotate(-45 ${xAt(tick.index)} ${LABEL_Y})`}
					>{tick.label}</text>
				</g>)}
				{path && <path className='play-history__line' d={path} />}
				{counts.length === 1 && <circle
					className='play-history__dot'
					r={3}
					cx={xAt(0)}
					cy={yAt(counts[0])}
				/>}
			</svg>
		)}
		{hover !== undefined && counts.length > 0 && <>
			<div
				className='graph-guide'
				style={{
					left: xAt(hover), top: PLOT_TOP, height: PLOT_BOTTOM - PLOT_TOP,
				}}
			/>
			<div ref={tooltip} className='graph-tooltip' style={{
				left: tipX, top: 0,
			}}>
				<div className='play-history__tooltip-when'>{monthLabel(dates[hover])}</div>
				<div className='play-history__tooltip-plays'>
					<Plural
						value={ph({ plays: counts[hover] })}
						_0='no plays'
						one='# play'
						other='# plays'
					/>
				</div>
			</div>
		</>}
	</div>;
}

import './TimeChart.css';

import { line } from 'd3-shape';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { clock } from './format';

export type Series = {
	label: string;
	/** One value per bucket, oldest first; undefined leaves a gap. */
	values: (number | undefined)[];
	/** 1-3: the dashboard's categorical slots; gray for a fourth, neutral line. */
	slot: 1 | 2 | 3 | 'gray';
};

type Props = {
	title: string;
	/** What one value is, under the title (e.g. "per minute"). */
	note?: string;
	series: Series[];
	start: number;
	bucketMs: number;
	format: (value: number) => string;
	height?: number;
	/** The axis reaches at least this, so a quiet day doesn't scale noise up. */
	floor?: number;
	/** Time between labels on the time axis. */
	tickMs?: number;
	/** How a time reads on the axis and in the tooltip. */
	time?: (at: number) => string;
};

const PAD = {
	top: 8, right: 12, bottom: 22, left: 44,
};
const TICKS = 4;

/** A round step giving about `ticks` steps up to `max`. */
const niceStep = (max: number) => {
	const raw = max / TICKS;
	const mag = 10 ** Math.floor(Math.log10(raw));
	return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
};

/** One measure over the last day: thin lines on one axis, hover for the values at a time. */
export default function TimeChart({
	title, note, series, start, bucketMs, format, height = 160, floor = 4,
	tickMs = 3 * 3_600_000, time = clock,
}: Props) {
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(600);
	const [hover, setHover] = useState<number>();
	const tip = useRef<HTMLDivElement>(null);
	const [tipWidth, setTipWidth] = useState(0);
	useLayoutEffect(() => setTipWidth(tip.current?.offsetWidth ?? 0), [hover, series]);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const count = series[0]?.values.length ?? 0;
	const max = Math.max(floor, ...series.flatMap(s => s.values.filter(v => v !== undefined)));
	const step = niceStep(max);
	const top = Math.ceil(max / step) * step;
	const plotW = Math.max(10, width - PAD.left - PAD.right);
	const plotH = height - PAD.top - PAD.bottom;
	const x = (i: number) => PAD.left + (count > 1 ? (i / (count - 1)) * plotW : 0);
	const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

	const paths = useMemo(() => series.map(s => line<number | undefined>()
		.defined(v => v !== undefined)
		.x((_, i) => x(i))
		.y(v => y(v!))(s.values) ?? ''), [series, width, top]);

	// ticks every `tickMs`, at the hour
	const hourTicks = useMemo(() => {
		const out: number[] = [];
		const first = Math.ceil(start / 3_600_000) * 3_600_000;
		for (let at = first; at < start + count * bucketMs; at += tickMs) out.push(at);
		return out;
	}, [start, count, bucketMs, tickMs]);

	const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const i = Math.round(((event.clientX - rect.left - PAD.left) / plotW) * (count - 1));
		// the margins snap to the nearest end
		setHover(count ? Math.min(count - 1, Math.max(0, i)) : undefined);
	};

	return (
		<figure className='time-chart'>
			<figcaption className='time-chart__head'>
				<span className='time-chart__title'>{title}</span>
				{note && <span className='time-chart__note'>{note}</span>}
				{series.length > 1 && <span className='time-chart__legend'>
					{series.map(s => <span key={s.label} className='time-chart__key'>
						<i className={`time-chart__swatch slot-${s.slot}`} />{s.label}
					</span>)}
				</span>}
			</figcaption>
			<div ref={box} className='time-chart__plot'>
				<svg
					width={width}
					height={height}
					onPointerMove={onMove}
					onPointerLeave={() => setHover(undefined)}
					role='img'
					aria-label={title}
				>
					{Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step).map(v => (
						<g key={v}>
							<line className='time-chart__grid' x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} />
							<text className='time-chart__tick' x={PAD.left - 6} y={y(v)} dy='0.32em' textAnchor='end'>
								{format(v)}
							</text>
						</g>
					))}
					{hourTicks.map(at => {
						const i = (at - start) / bucketMs;
						return <text key={at} className='time-chart__tick' x={x(i)} y={height - 6} textAnchor='middle'>
							{time(at)}
						</text>;
					})}
					{series.map((s, k) => (
						<path key={s.label} className={`time-chart__line slot-${s.slot}`} d={paths[k]} />
					))}
					{hover !== undefined && <>
						<line
							className='time-chart__cursor'
							x1={x(hover)}
							x2={x(hover)}
							y1={PAD.top}
							y2={PAD.top + plotH}
						/>
						{series.map(s => s.values[hover] !== undefined && (
							<circle
								key={s.label}
								className={`time-chart__dot slot-${s.slot}`}
								cx={x(hover)}
								cy={y(s.values[hover]!)}
								r={4}
							/>
						))}
					</>}
				</svg>
				{hover !== undefined && (
					<div
						ref={tip}
						className='time-chart__tip'
						style={{
							// right of the cursor, or left of it where it would run past the chart
							left: x(hover) + 12 + tipWidth <= width
								? x(hover) + 12
								: Math.max(0, x(hover) - 12 - tipWidth),
						}}
					>
						<span className='time-chart__tip-time'>
							{time(start + hover * bucketMs)} - {time(start + (hover + 1) * bucketMs)}
						</span>
						{series.map(s => (
							<span key={s.label} className='time-chart__tip-row'>
								<i className={`time-chart__swatch slot-${s.slot}`} />
								<span>{s.label}</span>
								<b>{s.values[hover] === undefined ? '-' : format(s.values[hover]!)}</b>
							</span>
						))}
					</div>
				)}
			</div>
		</figure>
	);
}

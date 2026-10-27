import './RankGraph.css';

import { ph } from '@lingui/core/macro';
import {
	Plural,
	Trans,
} from '@lingui/react/macro';
import {
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import num from '@oss-idle/shared/display/num';

import FancyGraph from '../FancyGraph';

const HEIGHT = 90;
const MARGIN = 3;

/** osu!-web style rank history sparkline: one point per day, oldest first,
 *  lower rank plotted higher, with a hover guide + tooltip. */
export default function RankGraph({ ranks }: { ranks: number[] }) {
	const container = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [hover, setHover] = useState<number>();

	useLayoutEffect(() => {
		const el = container.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setWidth(el.clientWidth));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const lastX = Math.max(ranks.length - 1, 1);
	const guideX = hover === undefined ? 0 : (hover / lastX) * (width - MARGIN);

	return (
		<div
			ref={container}
			className='rank-graph'
			onMouseMove={e => {
				const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
				const index = Math.round((x / (width - MARGIN)) * lastX);
				setHover(Math.max(0, Math.min(ranks.length - 1, index)));
			}}
			onMouseLeave={() => setHover(undefined)}
		>
			{width > 0 && (
				<FancyGraph
					data={ranks.map(rank => -rank)}
					width={width}
					height={HEIGHT}
					margin={MARGIN}
				/>
			)}
			{hover !== undefined && (
				<>
					<div className='graph-guide rank-graph__guide' style={{ left: guideX }} />
					<div className='graph-tooltip rank-graph__tooltip' style={{ left: guideX }}>
						<div className='rank-graph__tooltip-rank'>
							<Trans>Global Ranking</Trans> #{num(ranks[hover])}
						</div>
						<div className='rank-graph__tooltip-when'>
							<Plural
								value={ph({ days: ranks.length - 1 - hover })}
								_0='today'
								one='# day ago'
								other='# days ago'
							/>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

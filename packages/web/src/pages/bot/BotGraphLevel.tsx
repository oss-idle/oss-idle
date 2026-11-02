import { levelNode } from '@oss-idle/shared/display/levelDisplay';
import num from '@oss-idle/shared/display/num';

/** A skill's level where it sits on the graph, and the rank it would take. */
export default function BotGraphLevel({ level, left, top, rank, rough }: {
	level: number;
	/** where it sits, as shares of the graph */
	left: number;
	top: number;
	rank?: number;
	rough?: boolean;
}) {
	const shown = rough ? Math.round(level) : level;
	return <div
		className={`bot-graph__level ${rough ? 'is-rough' : ''}`}
		style={{
			left: `${left * 100}%`, top: `${top * 100}%`,
		}}
	>
		<div className='bot-graph__number'>{levelNode(shown, shown - Math.floor(shown))}</div>
		{rank && <div className='bot-graph__rank'>#{num(rank)}</div>}
	</div>;
}

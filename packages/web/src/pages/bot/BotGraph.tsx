import { useLingui } from '@lingui/react/macro';
import { useId } from 'react';

import {
	BOT_GRAPH_LINE,
	BOT_GRAPH_SIZE,
	botGraph,
	type BotMatchRanks,
} from '@oss-idle/shared/botMatch';
import { levelNode } from '@oss-idle/shared/display/levelDisplay';
import num from '@oss-idle/shared/display/num';
import { skillName } from '@oss-idle/shared/rulesets/mania/4k/display';

import BotGraphLevel from './BotGraphLevel';

/** The stepped skill shape, each skill's level on it, the overall in its middle. */
export default function BotGraph({ levels, overall, ranks, rough, measured }: {
	levels: Record<string, number>;
	overall: number;
	ranks?: BotMatchRanks;
	/** only a guess so far */
	rough?: boolean;
	/** the skills with a level of their own yet, when not all of them */
	measured?: Record<string, number>;
}) {
	const { t } = useLingui();
	const { width, height, cx, cy } = BOT_GRAPH_SIZE;
	const graph = botGraph(levels, skillName);
	const ids = useId();
	const middle = rough ? Math.round(overall) : overall;
	return <div className='bot-graph'>
		<svg viewBox={`0 0 ${width} ${height}`} role='img' aria-label={t`Skill shape`}>
			{graph.map(({ skill, step }) => <path
				key={skill} d={step} fill='none' stroke={BOT_GRAPH_LINE} strokeOpacity={0.55} strokeWidth={3}
			/>)}
			{graph.map(({ skill, arc, colour }) => <path
				key={skill} d={arc} fill='none' stroke={colour} strokeWidth={7} strokeLinecap='round'
			/>)}
			{graph.map(({ skill, labelPath }) => <path
				key={skill} id={`${ids}${skill}`} d={labelPath} fill='none'
			/>)}
			{graph.map(({ skill, name }) => <text key={skill} className='bot-graph__label' textAnchor='middle'>
				<textPath href={`#${ids}${skill}`} startOffset='50%'>{name}</textPath>
			</text>)}
		</svg>
		{graph.map(({ skill, number }) => (!measured || measured[skill]) && <BotGraphLevel
			key={skill}
			level={levels[skill] ?? 0}
			left={number.x / width}
			top={number.y / height}
			rank={ranks?.skills[skill]}
			rough={rough}
		/>)}
		<div className='bot-graph__hub' style={{
			left: `${cx / width * 100}%`, top: `${cy / height * 100}%`, 
		}}>
			<div className='bot-graph__overall'>{levelNode(middle, middle - Math.floor(middle))}</div>
			{ranks && <div className='bot-graph__place'>#{num(ranks.overall)}</div>}
		</div>
	</div>;
}

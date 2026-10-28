import { skillName } from '@oss-idle/shared/rulesets/mania/4k/display';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';

import type { AdminXpGainBest } from '../../../api/admin';
import { compact } from './scales';

type Cell = AdminXpGainBest['cells'][number];

/** A hovered band of one skill: its weighted pay, against the band's median skill,
 *  and its best maps. */
export default function BestTipBody({ cell, median }: { cell: Cell, median: number }) {
	return <>
		<span className='xp-gains__tip-head'>
			{skillName(cell.skill as SkillName)}, level {cell.band}
		</span>
		<span className='xp-gains__tip-row'>weighted XP per play <b>{compact(cell.perPlay)}</b></span>
		<span className='xp-gains__tip-row'>
			vs the band's median skill <b>×{(cell.perPlay / median).toFixed(2)}</b>
		</span>
		<span className='xp-gains__tip-row'>maps counted <b>{cell.maps}</b></span>
		{cell.top.map(m => <span key={m.id} className='xp-gains__tip-row'>
			<span className='xp-gains__tip-map'>{m.artist} - {m.title} [{m.version}]</span>
			<b>{compact(m.perPlay)}</b>
		</span>)}
	</>;
}

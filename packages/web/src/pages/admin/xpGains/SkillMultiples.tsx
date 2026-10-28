import { useState } from 'react';

import {
	extentOf,
	type XpBands,
} from './bands';
import CellTip, { type Tip } from './CellTip';
import MiniBars from './MiniBars';

/** A small chart per skill on one shared log scale, accuracy's pace drawn behind each. */
export default function SkillMultiples({ data }: { data: XpBands }) {
	const [tip, setTip] = useState<Tip>();
	const [lo, hi] = extentOf(data);
	return <>
		<p className='xp-gains__lede'>
			XP per play by level, one chart per skill on the same log scale; the dashed line is accuracy.
			Faded columns have under 20 plays.
		</p>
		<div className='xp-gains__multiples'>
			{data.skills.map((s, i) => (
				<MiniBars key={s} data={data} skill={i} lo={lo} hi={hi} onTip={setTip} />
			))}
		</div>
		<CellTip tip={tip} />
	</>;
}

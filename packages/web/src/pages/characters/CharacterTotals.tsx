import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import BigNum from '@oss-idle/shared/display/BigNum';
import num from '@oss-idle/shared/display/num';

import type { getCharacterStats } from '../../api/characters';
import Grade from '../../components/score/Grade';
import { headlineGrades } from './headlineGrades';

/** pp, play count and the headline grades; `children` adds totals after the play count. */
export default function CharacterTotals({ stats, children }: {
	stats: Awaited<ReturnType<typeof getCharacterStats>>;
	children?: ReactNode;
}) {
	return (
		<div className='character__totals'>
			<div className='character__totals_left'>
				<div className='character__totals-left-area'>
					<div className='character__totals-left-label'>pp</div>
					<div className='character__totals-left-num'>
						{num(Math.round(stats.pp))}
					</div>
				</div>
				<div className='character__totals-left-area'>
					<div className='character__totals-left-label'><Trans>Play Count</Trans></div>
					<div className='character__totals-left-num'><BigNum value={stats.playCount} theme='ocean' /></div>
				</div>
				{children}
			</div>
			<div className='character__totals_grades'>
				{headlineGrades(stats).map(g => (
					<div key={g} className='character__grades-area'>
						<Grade grade={g} />
						<div className='character__grades-num'><BigNum value={stats[g]} theme='ocean' /></div>
					</div>
				))}
			</div>
		</div>
	);
}

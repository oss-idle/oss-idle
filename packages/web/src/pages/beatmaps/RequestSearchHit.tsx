import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import type { MapSearchHit } from '../../api/mapRequests';

/** osu!'s own status for the set, purely informative here - any map can be
 *  proposed, ranked or not. */
const APPROVED_LABEL: Record<number, string> = {
	4: 'loved',
	3: 'qualified',
	2: 'approved',
	1: 'ranked',
	0: 'pending',
	[-1]: 'wip',
	[-2]: 'graveyard',
};

export default function RequestSearchHit({ label, hit, disabled, onPick }: {
	label: string,
	hit: MapSearchHit,
	disabled: boolean,
	onPick: (setId: number) => void,
}) {
	const sr = hit.srMin === hit.srMax
		? hit.srMin.toFixed(2)
		: `${hit.srMin.toFixed(2)} – ${hit.srMax.toFixed(2)}`;

	return (
		<button
			className='request-hit'
			disabled={disabled}
			onClick={() => onPick(hit.setId)}
		>
			<span
				className='request-hit__cover'
				style={{ backgroundImage: `url('https://assets.ppy.sh/beatmaps/${hit.setId}/covers/list.jpg')` }}
			/>
			<span className='request-hit__meta'>
				<span className='request-hit__title'>{hit.title}</span>
				<span className='request-hit__artist'>{hit.artist}</span>
				<span className='request-hit__creator'>
					<Trans>mapped by {ph({ creator: hit.creator })}</Trans>
				</span>
			</span>
			<span className='request-hit__stats'>
				<span className='request-hit__capsule'>{APPROVED_LABEL[hit.approved] ?? 'unknown'}</span>
				<span className='request-hit__sr'>{sr}☆</span>
				<span className='request-hit__diffs'>
					<Trans>{ph({ diffs: hit.diffs })} × {ph({ label })}</Trans>
				</span>
			</span>
		</button>
	);
}

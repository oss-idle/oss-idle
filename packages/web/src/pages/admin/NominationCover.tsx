import {
	faPause,
	faPlay,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	coverBackground,
	type Nomination,
	nominationPreviewUrl,
} from '../../api/maps';
import {
	preview,
	stopPreview,
	togglePreview,
} from '../../preview';

/** The set's cover; clicking it plays the audio preview. */
export default function NominationCover({ row, ruleset }: { row: Nomination, ruleset: RulesetId }) {
	const [playing] = useSynced(preview);
	const mine = playing?.setId === row.id ? playing : undefined;
	useEffect(() => () => stopPreview(row.id), [row.id]);

	return (
		<button
			type='button'
			className={`nomination__cover ${mine ? 'is-playing' : ''}`}
			style={{ backgroundImage: coverBackground(row, 'list') }}
			disabled={!row.audio}
			aria-label='Preview'
			onClick={() => togglePreview(row.id, nominationPreviewUrl(row.id, row.audio!, ruleset))}
		>
			{row.audio && <FontAwesomeIcon icon={mine && mine.state !== 'paused' ? faPause : faPlay} />}
		</button>
	);
}

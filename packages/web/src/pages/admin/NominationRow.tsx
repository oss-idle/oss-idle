import { useState } from 'react';

import {
	type ApprovedStatus,
	type BeatmapStatus,
	isApproved,
	type MapTag,
} from '@oss-idle/shared/beatmap';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	type Nomination,
	nominationOszUrl,
	type NominationPatch,
} from '../../api/maps';
import { formatDate } from './formatDate';
import NominationCategory from './NominationCategory';
import NominationCover from './NominationCover';
import NominationDiffs from './NominationDiffs';
import NominationMeta from './NominationMeta';
import NominationSchedule from './NominationSchedule';
import { phaseOf } from './nominationStatus';

/** ISO timestamp -> value for an <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | null): string => {
	if (!iso) return '';
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};



/** What scheduling ranks a set as: ranked, or loved (no pp). */
const categoryOf = (status: BeatmapStatus): ApprovedStatus =>
	isApproved(status) ? status : 'ranked';

export default function NominationRow({
	row, ruleset, busy, onPatch, onToggleDiff, onTagDiff, onDelete,
}: {
	row: Nomination;
	ruleset: RulesetId;
	busy: boolean;
	onPatch: (
		setId: number,
		body: NominationPatch,
	) => void;
	onToggleDiff: (setId: number, beatmapId: number, ranked: boolean) => void;
	onTagDiff: (setId: number, beatmapId: number, tags: MapTag[]) => void;
	/** admins only: it takes the set out of every ruleset */
	onDelete?: (setId: number) => void;
}) {
	const [date, setDate] = useState(toLocalInput(row.rankedAt));
	const scheduled = isApproved(row.status);
	const [category, setCategory] = useState(categoryOf(row.status));

	const phase = phaseOf(row);
	const live = phase === 'live';

	const schedule = () => date && onPatch(row.id, {
		rankedAt: new Date(date).toISOString(), status: category, 
	});
	const rankNow = () => onPatch(row.id, {
		rankedAt: new Date().toISOString(), status: category, 
	});
	const scheduleIn = (ms: number) =>
		onPatch(row.id, {
			rankedAt: new Date(Date.now() + Math.random() * ms).toISOString(), status: category, 
		});
	const unrank = () =>
		confirm('Unrank this set? All scores and progression earned on its '
			+ 'difficulties will be permanently deleted.')
		&& onPatch(row.id, {
			status: 'pending', rankedAt: null,
		});
	const reject = () => onPatch(row.id, { status: 'rejected' });
	// a player's own map, submitted for rank: theirs again, with the reason why
	const player = !!row.submittedBy;
	const sendBack = () => {
		const note = prompt('Why does it go back to its mapper? They see this.');
		if (note !== null) onPatch(row.id, {
			status: 'unranked', note, 
		});
	};

	return (
		<div className='nomination__entry'>
			<div className='nomination__info'>
				<NominationCover row={row} ruleset={ruleset} />
				<NominationMeta row={row} player={player} />

				<span className={`nomination__badge nomination__badge--${phase}`}>{phase}</span>

				<div className='nomination__stat'>
					<span className='nomination__label'>Diffs</span>
					<span>{row.diffs.filter(d => d.ranked).length}/{row.diffs.length}</span>
				</div>
				<div className='nomination__stat'>
					<span className='nomination__label'>Plays</span>
					<span>{row.plays ?? 0}</span>
				</div>
				<div className='nomination__stat'>
					<span className='nomination__label'>Submitted</span>
					<span>{formatDate(row.submittedAt)}</span>
				</div>
				<NominationCategory
					category={category}
					busy={busy}
					onChange={next => {
						setCategory(next);
						// a scheduled or live set moves at once
						if (scheduled) onPatch(row.id, { status: next });
					}}
					scheduled={scheduled}
				/>
				<div className='nomination__stat'>
					<span className='nomination__label'>Date</span>
					{live
						? <span>{formatDate(row.rankedAt)}</span>
						: <input 
							className='nomination__field'
							type='datetime-local'
							value={date} 
							disabled={busy} 
							onChange={e => setDate(e.target.value)}
						/>}
				</div>
			</div>

			<NominationDiffs
				diffs={row.diffs}
				busy={busy}
				live={live}
				onToggle={(beatmapId, ranked) => onToggleDiff(row.id, beatmapId, ranked)}
				onTags={(beatmapId, tags) => onTagDiff(row.id, beatmapId, tags)}
			/>

			<div className='nomination__actions'>
				{category === 'ranked' && <button
					className={`nomination__tag ${row.bundled ? 'is-on' : ''}`}
					disabled={busy}
					onClick={() => onPatch(row.id, { bundled: !row.bundled })}
				>
					Bundled
				</button>}
				<button
					className={`nomination__tag ${row.categorized ? 'is-on' : ''}`}
					disabled={busy}
					onClick={() => onPatch(row.id, { categorized: !row.categorized })}
				>
					Categorized
				</button>
				{!live && <NominationSchedule
					busy={busy}
					date={date}
					category={category}
					onSchedule={schedule}
					onRankNow={rankNow}
					onScheduleIn={scheduleIn}
				/>}
				{scheduled && <button 
					className='nomination__btn' 
					disabled={busy} 
					onClick={unrank}
				>
					Unrank
				</button>}
				{row.status === 'pending' && <button
					className='nomination__btn nomination__btn--warn' 
					disabled={busy} 
					onClick={player ? sendBack : reject}
				>
					{player ? 'Send back' : 'Reject'}
				</button>}
				<a className='nomination__btn' href={nominationOszUrl(row.id, ruleset)} download>Download</a>
				{onDelete && <button 
					className='nomination__btn nomination__btn--danger'
					disabled={busy}
					onClick={() => onDelete(row.id)}
				>
					Delete
				</button>}
			</div>
		</div>
	);
}

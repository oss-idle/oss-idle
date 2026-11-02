import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import {
	maxPendingRequests,
	parseBeatmapsetId,
} from '@oss-idle/shared/beatmapRequest';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	type MapSearchHit,
	searchMapRequests,
	submitMapRequest,
} from '../../api/mapRequests';
import RequestSearchHit from './RequestSearchHit';

const DEBOUNCE_MS = 250;

/** Propose a map: search the beatmap mirror by name, or paste the link of one it
 *  doesn't carry. Both paths end in the same submit, keyed by beatmapset id. */
export default function RequestForm({ ruleset, label, pending, supporter, onSubmitted }: {
	ruleset?: RulesetId,
	label: string,
	pending: number,
	supporter: boolean,
	onSubmitted: () => Promise<void> | void,
}) {
	const { t } = useLingui();
	const [text, setText] = useState('');
	const [hits, setHits] = useState<MapSearchHit[]>([]);
	const [searching, setSearching] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();

	// A link or an id is submitted as typed - searching for it would find nothing.
	const pasted = parseBeatmapsetId(text);
	const max = maxPendingRequests(supporter);
	const full = pending >= max;

	useEffect(() => {
		const query = text.trim();
		if (pasted !== undefined || query.length < 2) { setHits([]); return; }

		let live = true;
		setSearching(true);
		const timer = setTimeout(() => {
			searchMapRequests(query, ruleset)
				.then(rows => { if (live) setHits(rows); })
				.catch(() => { if (live) setHits([]); })
				.finally(() => { if (live) setSearching(false); });
		}, DEBOUNCE_MS);

		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [text, pasted, ruleset]);

	const submit = async (map: string) => {
		setBusy(true);
		setError(undefined);
		try {
			await submitMapRequest(map, ruleset);
			setText('');
			setHits([]);
			await onSubmitted();
		} catch (e) {
			setError(String((e as Error).message ?? e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className='request-form'>
			<div className='request-form__row'>
				<FontAwesomeIcon icon={faMagnifyingGlass} className='request-form__icon' />
				<input
					className='request-form__input'
					value={text}
					disabled={busy || full}
					placeholder={t`Search a ${ph({ label })} map, or paste its beatmapset link`}
					onChange={e => setText(e.target.value)}
					onKeyDown={e => { if (e.key === 'Enter' && pasted !== undefined) void submit(text); }}
				/>
				{pasted !== undefined && (
					<button
						className='request-form__submit'
						disabled={busy || full}
						onClick={() => void submit(text)}
					>
						<Trans>Request</Trans>
					</button>
				)}
			</div>

			{full && <p className='request-form__note'>
				<Trans>
					You already have {ph({ max })} requests waiting. Wait for one to
					be answered before proposing another.
				</Trans>
			</p>}

			{error && <p className='request-form__error'>{error}</p>}

			{!!hits.length && (
				// Kept on screen while the next search runs, dimmed so it reads as stale.
				<div className={`request-form__hits ${searching ? 'is-loading' : ''}`}>
					{hits.map(hit => (
						<RequestSearchHit
							label={label}
							key={hit.setId}
							hit={hit}
							disabled={busy || full}
							onPick={setId => void submit(String(setId))}
						/>
					))}
				</div>
			)}

			{!hits.length && !searching && pasted === undefined && text.trim().length >= 2 && (
				<p className='request-form__note'>
					<Trans>
						Nothing found. If the map isn't listed, paste its beatmapset link instead.
					</Trans>
				</p>
			)}
		</div>
	);
}

import './Nomination.css';

import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import type { MapTag } from '@oss-idle/shared/beatmap';
import { nominatesIn } from '@oss-idle/shared/groups';
import { useAction } from '@oss-idle/shared/hooks/useAction';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	deleteNomination,
	listNominations,
	type Nomination,
	type NominationPatch,
	setDiffRanked,
	setDiffTags,
	updateNomination,
	uploadBeatmap,
} from '../../api/maps';
import Link from '../../components/Link';
import { useAdmin } from '../../hooks/useAdmin';
import {
	useAuthLoaded,
	useCurrentUser,
} from '../../hooks/useCurrentUser';
import { QUEUED_RULESETS } from '../../rulesets';
import NominationRow from './NominationRow';
import {
	PHASE_ORDER,
	phaseOf,
} from './nominationStatus';

type SortKey = 'status' | 'submitted' | 'ranked';
const PAGE_SIZE = 20;

const time = (iso: string | null): number => iso ? new Date(iso).getTime() : 0;

const toCategorize = (r: Nomination) => !r.categorized && r.status !== 'rejected';
const isPending = (r: Nomination) => r.status === 'pending';

export default function NominationPage({ ruleset: asked }: {
	/** the first one the viewer ranks maps in when left out */
	ruleset?: RulesetId,
}) {
	const user = useCurrentUser() ?? undefined;
	const admin = useAdmin();
	const rulesets = QUEUED_RULESETS.filter(id => nominatesIn(user, id));
	const ruleset = asked ?? rulesets[0];
	const [list, setList] = useState<Nomination[] | null>(null);
	// null = still checking, false = denied, true = authorized.
	const [authorized, setAuthorized] = useState<boolean | null>(null);
	const {
		busy, error, setError, run: runAction,
	} = useAction();
	const [progress, setProgress] = useState<string | null>(null);
	const [sort, setSort] = useState<SortKey>('submitted');
	const [asc, setAsc] = useState(false);
	const [page, setPage] = useState(0);
	// only the sets whose tags haven't been reviewed
	const [queue, setQueue] = useState(false);
	const [pendingOnly, setPendingOnly] = useState(false);

	// The server is the real gate: if listing the queue succeeds we may rank in this ruleset.
	const refresh = () =>
		listNominations(ruleset)
			.then(rows => { setList(rows); setAuthorized(true); })
			.catch(e => { setAuthorized(false); setError(String(e.message ?? e)); });

	// a nominator's rulesets come with their session: asking before it's known would be refused
	const loaded = useAuthLoaded();
	useEffect(() => {
		if (ruleset) void refresh();
		else if (loaded) setAuthorized(false);
	}, [ruleset, loaded]);

	const run = (action: () => Promise<unknown>) => runAction(action, refresh);

	const onUpload = (files: FileList | null) => {
		const list = files ? [...files] : [];
		if (!list.length) return;
		return run(async () => {
			const failed: string[] = [];
			for (let i = 0; i < list.length; i++) {
				setProgress(`${i + 1}/${list.length}`);
				try {
					await uploadBeatmap(list[i], ruleset);
				} catch (e) {
					const msg = String((e as Error).message ?? e);
					// Already-ranked sets are skipped, not a failure of the batch.
					if (msg.includes('already ranked')) continue;
					failed.push(`${list[i].name}: ${msg}`);
				}
			}
			setProgress(null);
			if (failed.length) throw new Error(failed.join('\n'));
		});
	};
	// Metadata shows at once and saves in the background, one request after another.
	const saving = useRef(Promise.resolve());
	const quick = (
		setId: number,
		change: (r: Nomination) => Nomination,
		save: () => Promise<unknown>,
	) => {
		setList(l => l && l.map(r => r.id === setId ? change(r) : r));
		saving.current = saving.current.then(save).then(() => {}, e => {
			setError(String((e as Error).message ?? e));
			void refresh();
		});
	};

	const patch = (
		setId: number,
		body: NominationPatch,
	) => 'status' in body || 'rankedAt' in body
		? run(() => updateNomination(setId, body, ruleset))
		: quick(setId, r => ({
			...r, ...body, 
		}), () => updateNomination(setId, body, ruleset));
	const toggleDiff = (setId: number, beatmapId: number, ranked: boolean) =>
		run(() => setDiffRanked(setId, beatmapId, ranked));
	const tagDiff = (setId: number, beatmapId: number, tags: MapTag[]) => quick(
		setId,
		r => ({
			...r, diffs: r.diffs.map(d => d.id === beatmapId ? {
				...d, tags, 
			} : d), 
		}),
		() => setDiffTags(setId, beatmapId, tags),
	);
	const remove = (setId: number) => confirm('Delete this set and its files?') 
		&& run(() => deleteNomination(setId));

	const sorted = useMemo(() => {
		const dir = asc ? 1 : -1;
		const key = (r: Nomination) => sort === 'status' ? PHASE_ORDER[phaseOf(r)]
			: sort === 'ranked' ? time(r.rankedAt) : time(r.submittedAt);
		return (list ?? [])
			.filter(r => (!queue || toCategorize(r)) && (!pendingOnly || isPending(r)))
			.sort((a, b) => (key(a) - key(b)) * dir);
	}, [list, sort, asc, queue, pendingOnly]);

	const toggleSort = (key: SortKey) => {
		if (sort === key) setAsc(a => !a);
		else { setSort(key); setAsc(false); }
		setPage(0);
	};

	const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
	const current = Math.min(page, pageCount - 1);
	const rows = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

	const caret = (key: SortKey) => sort === key ? (asc ? ' ▲' : ' ▼') : '';
	const sortBtn = (key: SortKey, label: string) => (
		<button 
			className={`nomination__sort-btn ${sort === key ? 'current' : ''}`}
			onClick={() => toggleSort(key)}
		>
			{label}{caret(key)}
		</button>
	);

	if (authorized === false) return <main className='nomination'>
		<p className='nomination__error'>{error ?? 'Nominators only.'}</p>
	</main>;
	if (!list) return <main className='nomination'><p className='nomination__muted'>Loading…</p></main>;

	return (
		<main className='nomination'>
			{rulesets.length > 1 && (
				<div className='nomination__sort nomination__rulesets'>
					<span className='nomination__muted'>Mode</span>
					{rulesets.map(id => (
						<Link
							key={id}
							to='/admin/nomination'
							search={{ ruleset: id }}
							className={`nomination__sort-btn ${id === ruleset ? 'current' : ''}`}
						>
							{rulesetLabel(id)}
						</Link>
					))}
				</div>
			)}
			<div className='nomination__toolbar'>
				<label className={`nomination__btn nomination__btn--primary ${busy ? 'is-disabled' : ''}`}>
					{busy ? `Working… ${progress ?? ''}` : 'Upload .osz'}
					<input
						type='file'
						accept='.osz'
						multiple
						hidden disabled={busy}
						onChange={e => onUpload(e.target.files)}
					/>
				</label>
				<div className='nomination__sort'>
					<span className='nomination__muted'>Sort by</span>
					{sortBtn('status', 'Status')}
					{sortBtn('submitted', 'Submitted')}
					{sortBtn('ranked', 'Ranked')}
				</div>
				<button
					className={`nomination__btn ${queue ? 'nomination__btn--primary' : ''}`}
					onClick={() => { setQueue(q => !q); setPage(0); }}
				>
					To categorize ({list.filter(toCategorize).length})
				</button>
				<button
					className={`nomination__btn ${pendingOnly ? 'nomination__btn--primary' : ''}`}
					onClick={() => { setPendingOnly(p => !p); setPage(0); }}
				>
					Pending ({list.filter(isPending).length})
				</button>
				<Link to='/maps/requests' search={{
					ruleset, filter: 'open', sort: 'support', page: 1,
				}} className='nomination__btn'>
					Player requests
				</Link>
				<span className='nomination__count'>{sorted.length} sets</span>
			</div>

			{error && <p className='nomination__error'>{error}</p>}

			<div className='nomination__list'>
				{rows.map(row => (
					<NominationRow
						key={row.id}
						row={row}
						ruleset={ruleset}
						busy={busy}
						onPatch={patch}
						onToggleDiff={toggleDiff}
						onTagDiff={tagDiff}
						onDelete={admin ? remove : undefined}
					/>
				))}
			</div>

			{pageCount > 1 && (
				<div className='nomination__pager'>
					<button 
						className='nomination__btn' 
						disabled={current === 0}
						onClick={() => setPage(current - 1)}
					>
						Prev
					</button>
					<span className='nomination__muted'>Page {current + 1} of {pageCount}</span>
					<button
						className='nomination__btn' 
						disabled={current >= pageCount - 1} 
						onClick={() => setPage(current + 1)}
					>
						Next
					</button>
				</div>
			)}
		</main>
	);
}

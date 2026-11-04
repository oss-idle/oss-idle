import './MapRequests.css';

import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';

import { useAction } from '@oss-idle/shared/hooks/useAction';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	deleteMapRequest,
	ingestMapRequest,
	listMapRequests,
	type MapRequest,
	resolveMapRequest,
	toggleMapSupport,
} from '../../api/mapRequests';
import { uploadBeatmap } from '../../api/maps';
import Link from '../../components/Link';
import { useNominator } from '../../hooks/useAdmin';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import MapsNav from './MapsNav';
import RequestBulkBar, { type BulkProgress } from './RequestBulkBar';
import RequestForm from './RequestForm';
import RequestModeTabs from './RequestModeTabs';
import RequestRow from './RequestRow';
import { useRequestRulesets } from './useRequestRulesets';

export type RequestFilter = 'open' | 'accepted' | 'rejected' | 'mine' | 'all';
export type RequestSort = 'support' | 'date';

const PAGE_SIZE = 20;

const time = (iso: string | null) => iso ? new Date(iso).getTime() : 0;

const matches = (row: MapRequest, filter: RequestFilter, userId?: number): boolean => {
	if (filter === 'all') return true;
	if (filter === 'mine') return row.userId === userId;
	if (filter === 'open') return row.status === 'pending';
	return row.status === filter;
};

export default function MapRequests({ ruleset: asked, filter, sort, page }: {
	/** the server's first when left out */
	ruleset?: RulesetId,
	filter: RequestFilter,
	sort: RequestSort,
	page: number,
}) {
	const { t } = useLingui();
	const user = useCurrentUser();

	const [list, setList] = useState<MapRequest[]>();
	const {
		busy, error, setError, run: runAction,
	} = useAction();
	const [selected, setSelected] = useState(new Set<number>());
	const [progress, setProgress] = useState<BulkProgress>();

	const { tabs, ruleset, shownRuleset } = useRequestRulesets(asked);
	const admin = useNominator(shownRuleset);
	const label = rulesetLabel(shownRuleset);

	const refresh = useCallback(() => listMapRequests(ruleset)
		.then(setList)
		.catch(e => setError(String((e as Error).message ?? e))), [ruleset]);

	useEffect(() => { void refresh(); }, [refresh]);

	const run = (action: () => Promise<unknown>) => runAction(action, refresh);

	// The mirror can't serve every set: an .osz fetched by hand goes the same way.
	const upload = (setId: number, file: File) => run(async () => {
		const { osuSetId } = await uploadBeatmap(file, ruleset);
		if (osuSetId !== setId) {
			throw new Error(t`That .osz is another set: it went to the nomination queue, this request stays open`);
		}
	});

	// One at a time, so the mirror is not hit with every download at once.
	const bulk = (fn: (setId: number) => Promise<unknown>) => runAction(async () => {
		const ids = [...selected];
		const failed: string[] = [];
		const startedAt = Date.now();
		for (const [i, setId] of ids.entries()) {
			const row = list?.find(r => r.setId === setId);
			setProgress({
				done: i,
				total: ids.length,
				current: row ? `${row.artist} - ${row.title}` : String(setId),
				startedAt,
			});
			try {
				await fn(setId);
			} catch (e) {
				failed.push(`${setId}: ${String((e as Error).message ?? e)}`);
			}
		}
		setProgress(undefined);
		setSelected(new Set());
		await refresh();
		if (failed.length) throw new Error(failed.join('\n'));
	});

	const toggleSelect = (setId: number) => setSelected(prev => {
		const next = new Set(prev);
		if (!next.delete(setId)) next.add(setId);
		return next;
	});

	const rows = useMemo(() => {
		const kept = (list ?? []).filter(row => matches(row, filter, user?.id));
		return kept.sort((a, b) => sort === 'support'
			? b.support - a.support || time(b.createdAt) - time(a.createdAt)
			: time(b.createdAt) - time(a.createdAt));
	}, [list, filter, sort, user?.id]);

	const pending = (list ?? [])
		.filter(row => row.status === 'pending' && row.userId === user?.id).length;

	const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const current = Math.min(page, pageCount);
	const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

	const filters: [RequestFilter, string][] = [
		['open', t`open`],
		['accepted', t`accepted`],
		['rejected', t`rejected`],
		...user ? [['mine', t`mine`] as [RequestFilter, string]] : [],
		['all', t`all`],
	];
	const sorts: [RequestSort, string][] = [
		['support', t`most wanted`],
		['date', t`newest`],
	];

	return (
		<main>
			<MapsNav current='requests' />

			<div className='page-contents'>
				<p className='requests__intro'>
					<Trans>
						Anyone can propose a map for ranking in oss!idle - osu!mania {ph({ label })} only.
						Support the ones you want to play so it shows what people are after.
						Accepted maps join the nomination queue and are ranked from there.
					</Trans>
				</p>

				{user
					? <RequestForm
						ruleset={ruleset}
						label={label}
						pending={pending}
						supporter={user.supporter}
						onSubmitted={refresh}
					/>
					: <p className='requests__signed-out'>
						<Trans>
							<Link to='/login'>Sign in</Link> to propose a map or support someone else's.
						</Trans>
					</p>}

				{error && <p className='requests__error'>{error}</p>}

				<div className='requests__toolbar'>
					<RequestModeTabs
						tabs={tabs}
						shown={shownRuleset}
						filter={filter}
						sort={sort}
					/>
					<div className='requests__tabs'>
						{filters.map(([id, label]) => (
							<Link
								key={id}
								to='/maps/requests'
								search={{
									ruleset, filter: id, sort, page: 1,
								}}
								className={`requests__tab ${id === filter ? 'current' : ''}`}
							>
								{label}
							</Link>
						))}
					</div>
					<div className='requests__tabs'>
						<span className='requests__muted'><Trans>Sort by</Trans></span>
						{sorts.map(([id, label]) => (
							<Link
								key={id}
								to='/maps/requests'
								search={{
									ruleset, filter, sort: id, page: 1,
								}}
								className={`requests__tab ${id === sort ? 'current' : ''}`}
							>
								{label}
							</Link>
						))}
					</div>
				</div>

				{!list && <p className='requests__muted'><Trans>Loading…</Trans></p>}
				{list && !rows.length && <p className='requests__muted'><Trans>Nothing here yet.</Trans></p>}

				{admin && (
					<RequestBulkBar
						count={selected.size}
						progress={progress}
						busy={busy}
						onSelectPage={() => setSelected(new Set(shown
							.filter(row => row.status === 'pending')
							.map(row => row.setId)))}
						onClear={() => setSelected(new Set())}
						onIngest={() => void bulk(setId => ingestMapRequest(setId, ruleset))}
						onAccept={() => void bulk(setId => resolveMapRequest(setId, 'accepted', undefined, ruleset))}
						onReject={() => void bulk(setId => resolveMapRequest(setId, 'rejected', undefined, ruleset))}
						onDelete={() => confirm(t`Drop ${plural(ph({ count: selected.size }), {
							one: '# request', other: '# requests', 
						})}?`)
							&& void bulk(setId => deleteMapRequest(setId, ruleset))}
					/>
				)}

				<div className='requests__list'>
					{shown.map(row => (
						<RequestRow
							key={row.setId}
							row={row}
							mine={row.userId === user?.id}
							admin={admin}
							busy={busy}
							selected={selected.has(row.setId)}
							onSelect={toggleSelect}
							onSupport={setId => void run(() => toggleMapSupport(setId, ruleset))}
							onResolve={(setId, status, note) => void run(() => resolveMapRequest(setId, status, note, ruleset))}
							onIngest={setId => void run(() => ingestMapRequest(setId, ruleset))}
							onUpload={(setId, file) => void upload(setId, file)}
							onDelete={setId => confirm(t`Drop this request?`)
								&& void run(() => deleteMapRequest(setId, ruleset))}
						/>
					))}
				</div>

				{pageCount > 1 && (
					<div className='requests__pager'>
						{Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
							<Link
								key={n}
								to='/maps/requests'
								search={{
									ruleset, filter, sort, page: n,
								}}
								className={`requests__tab ${n === current ? 'current' : ''}`}
							>
								{n}
							</Link>
						))}
					</div>
				)}
			</div>
		</main>
	);
}

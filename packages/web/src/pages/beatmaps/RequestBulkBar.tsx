import {
	Plural,
	Trans,
} from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

export type BulkProgress = {
	done: number,
	total: number,
	current: string,
	startedAt: number,
};

const clock = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function RequestBulkBar({
	count, progress, busy, onSelectPage, onClear, onIngest, onAccept, onReject, onDelete,
}: {
	count: number,
	progress?: BulkProgress,
	busy: boolean,
	onSelectPage: () => void,
	onClear: () => void,
	onIngest: () => void,
	onAccept: () => void,
	onReject: () => void,
	onDelete: () => void,
}) {
	const [now, setNow] = useState(Date.now);

	useEffect(() => {
		if (!progress) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [progress]);

	if (progress) {
		const { done, total, current, startedAt } = progress;
		const elapsed = Math.max(0, now - startedAt);
		const left = done ? clock(elapsed / done * (total - done)) : '?';
		const step = done + 1;
		const spent = clock(elapsed);
		return (
			<div className='requests__bulk requests__bulk--running'>
				<progress className='requests__progress' value={done} max={total} />
				<span className='requests__muted'>
					<Trans>{step}/{total} · {current} · {spent} elapsed · ~{left} left</Trans>
				</span>
			</div>
		);
	}

	return (
		<div className='requests__bulk'>
			<span className='requests__muted'>
				<Plural value={count} one='# selected' other='# selected' />
			</span>
			<button className='request__btn' disabled={busy} onClick={onSelectPage}>
				<Trans>Select page</Trans>
			</button>
			{count > 0 && <>
				<button className='request__btn' disabled={busy} onClick={onClear}>
					<Trans>Clear</Trans>
				</button>
				<button className='request__btn request__btn--primary' disabled={busy} onClick={onIngest}>
					<Trans>Ingest selected</Trans>
				</button>
				<button className='request__btn' disabled={busy} onClick={onAccept}>
					<Trans>Accept selected</Trans>
				</button>
				<button className='request__btn request__btn--warn' disabled={busy} onClick={onReject}>
					<Trans>Reject selected</Trans>
				</button>
				<button className='request__btn request__btn--danger' disabled={busy} onClick={onDelete}>
					<Trans>Delete selected</Trans>
				</button>
			</>}
		</div>
	);
}

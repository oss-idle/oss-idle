import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import { dateAgo } from '@oss-idle/shared/display/ago';

import type { MapRequest } from '../../api/mapRequests';
import OutLink from '../../components/OutLink';
import ProfilePicture from '../../components/ProfilePicture';
import RequestActions from './RequestActions';
import {
	PHASE_LABEL,
	phaseOf,
} from './requestPhase';

export default function RequestRow({
	row, mine, admin, busy, selected, onSelect, onSupport, onResolve, onIngest, onUpload, onDelete,
}: {
	row: MapRequest,
	mine: boolean,
	admin: boolean,
	busy: boolean,
	selected: boolean,
	onSelect: (setId: number) => void,
	onSupport: (setId: number) => void,
	onResolve: (setId: number, status: 'accepted' | 'rejected', note?: string) => void,
	onIngest: (setId: number) => void,
	onUpload: (setId: number, file: File) => void,
	onDelete: (setId: number) => void,
}) {
	const { t, i18n } = useLingui();

	const phase = phaseOf(row);
	const open = phase === 'open';

	return (
		<div className={`request request--${phase}`}>
			{admin && open && (
				<input
					type='checkbox'
					className='request__select'
					checked={selected}
					disabled={busy}
					onChange={() => onSelect(row.setId)}
				/>
			)}
			<div
				className='request__cover'
				style={{ backgroundImage: `url('https://assets.ppy.sh/beatmaps/${row.setId}/covers/list.jpg')` }}
			/>

			<div className='request__meta'>
				<OutLink
					className='request__title'
					href={`https://osu.ppy.sh/beatmapsets/${row.setId}`}
					target='_blank'
				>
					{row.title}
				</OutLink>
				<span className='request__artist'>{row.artist}</span>
				<span className='request__creator'><Trans>mapped by {ph({ creator: row.creator })}</Trans></span>
				<div className='request__bottom'>
					<span className={`request__capsule request__capsule--${phase}`}>
						{i18n._(PHASE_LABEL[phase])}
					</span>
					<span className='request__ago'>{dateAgo(row.createdAt)}</span>
				</div>
				{row.note && <p className='request__note'>{row.note}</p>}
			</div>

			<div className='request__requester'>
				<ProfilePicture avatarUrl={row.avatarUrl} className='request__avatar' />
				<span className='request__username'>{row.username}</span>
			</div>

			<button
				className={`request__support ${row.supported ? 'is-supported' : ''}`}
				disabled={busy || !open}
				title={open
					? (row.supported ? t`Remove your support` : t`Support this request`)
					: t`This request has been answered`}
				onClick={() => onSupport(row.setId)}
			>
				<FontAwesomeIcon icon={faHeart} />
				<span>{row.support}</span>
			</button>

			{(admin || (mine && open)) && (
				<RequestActions
					setId={row.setId}
					mine={mine}
					admin={admin}
					open={open}
					busy={busy}
					onResolve={onResolve}
					onIngest={onIngest}
					onUpload={onUpload}
					onDelete={onDelete}
				/>
			)}
		</div>
	);
}

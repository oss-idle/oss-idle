import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import { dateAgo } from '@oss-idle/shared/display/ago';

import type { Bug } from '../../api/bugs';
import Link from '../../components/Link';
import BugImages from './BugImages';
import BugStatusPill from './BugStatusPill';

export default function BugMessage({ message }: { message: Bug['messages'][number] }) {
	const { t } = useLingui();
	const { author } = message;
	return <div className={`bug-message ${message.team ? 'bug-message--team' : ''}`}>
		<div className='bug-message__head'>
			{author.characterId
				? <Link to='/c/$id' params={{ id: String(author.characterId) }}>{author.name}</Link>
				: <span>{author.name ?? t`deleted account`}</span>}
			{message.team && <span className='bug-message__team'>{t`team`}</span>}
			<span className='bugs__muted'>{dateAgo(message.createdAt)}</span>
			{message.status && <span className='bugs__muted'>
				<Trans>set the status to <BugStatusPill status={message.status} /></Trans>
			</span>}
		</div>
		{message.body && <div className='bug-message__body'>{message.body}</div>}
		<BugImages images={message.images} />
	</div>;
}

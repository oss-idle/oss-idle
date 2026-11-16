import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faPen } from '@fortawesome/free-solid-svg-icons/faPen';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import Link from '../../components/Link';
import OutLink from '../../components/OutLink';
import type { Entry } from './builds';

const REPO = 'https://github.com/oss-idle/oss-idle';

const ICONS = {
	add: faPlus, change: faPen, fix: faCheck,
} satisfies Record<Entry['type'], unknown>;

/** Inline `code` is the only markup a title carries, as on osu!. */
const title = (text: string) =>
	text.split(/`([^`]+)`/).map((part, i) => i % 2 ? <code key={i}>{part}</code> : part);

export default function ChangelogEntry({ entry }: { entry: Entry }) {
	return (
		<div className={`changelog-entry ${entry.major ? 'changelog-entry--major' : ''}`}>
			<span className='changelog-entry__title-icon'>
				<FontAwesomeIcon icon={ICONS[entry.type]} className='changelog-entry__icon' />
			</span>
			{title(entry.title)}
			{entry.thanks && <span className='changelog-entry__user'>
				<Trans>
					thanks to <Link
						to='/c/$id'
						params={{ id: String(entry.thanks.character) }}
						className='changelog-entry__user-link'
					>{ph({ player: entry.thanks.name })}</Link>
				</Trans>
			</span>}
			{entry.pr && <>
				{' ('}
				<OutLink href={`${REPO}/pull/${entry.pr}`} target='_blank' className='changelog-entry__link'>
					oss-idle#{entry.pr}
				</OutLink>
				{')'}
			</>}
			{entry.author && <span className='changelog-entry__user'>
				<Trans>
					by <OutLink
						href={`https://github.com/${entry.author}`}
						target='_blank'
						className='changelog-entry__user-link'
					>{ph({ author: entry.author })}</OutLink>
				</Trans>
			</span>}
		</div>
	);
}

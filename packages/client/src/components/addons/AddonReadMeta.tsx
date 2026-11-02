import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { repoCommitUrl } from '@oss-idle/shared/addon';
import Markdown from '@oss-idle/shared/display/Markdown';

import { addonIconUrl } from '../../online/addons';
import ListingIcon from '../listing/ListingIcon';
import type { AddonDetail } from './AddonView';

/** Read-only left column of the add-on view (details / update / install). */
export default function AddonReadMeta({ detail }: { detail: AddonDetail }) {
	return (
		<>
			<div className='listing-view__head'>
				<ListingIcon url={addonIconUrl(detail.icon)} name={detail.name} />
				<div className='listing-view__headmeta'>
					<div className='listing-view__name'>
						{detail.name}<span className='listing__ver'>v{detail.version}</span>
					</div>
					{detail.authorName && <div className='listing__by'>
						<Trans>by {ph({ author: detail.authorName })} for game version {ph({ version: detail.gameVersion })}</Trans>
					</div>}
				</div>
			</div>
			{detail.tags.length > 0 && <div className='listing__tags'>
				{detail.tags.map(t => <span key={t} className='listing__tag'>{t}</span>)}
			</div>}
			{detail.description && <Markdown className='listing-view__desc' text={detail.description} />}
			{detail.repoUrl && detail.commit && detail.tag && (
				<div className='listing__by'>
					<Trans>Built from</Trans>{' '}
					<a href={repoCommitUrl(detail.repoUrl, detail.commit)} target='_blank' rel='noreferrer'>
						{detail.repoUrl.replace(/^https:\/\//, '')} {detail.tag}
					</a>
				</div>
			)}
		</>
	);
}

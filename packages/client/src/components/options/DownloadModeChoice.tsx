import { useLingui } from '@lingui/react/macro';
import { createPortal } from 'react-dom';

import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import ContextMenu from '../ContextMenu';

/** Before downloading every ranked beatmap: only the picked mode's, or every mode's. */
export default function DownloadModeChoice({ ruleset, onPick, onClose }: {
	ruleset: RulesetId;
	onPick: (ruleset?: RulesetId) => void;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const mode = rulesetLabel(ruleset);
	return createPortal(<div className="download-all-warning">
		<ContextMenu
			unnumbered
			title={t`Which ranked beatmaps?`}
			onClose={onClose}
			options={[
				{
					label: t`Only ${mode} beatmaps`, color: '#d64045', onClick: () => onPick(ruleset), 
				},
				{
					label: t`All modes`, color: '#2f5f9a', onClick: () => onPick(), 
				},
				{
					label: t`Cancel`, color: '#6b6b6b', onClick: onClose, 
				},
			]}
		/>
	</div>, document.body);
}

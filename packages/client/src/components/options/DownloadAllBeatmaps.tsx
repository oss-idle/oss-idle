import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import Log from '@oss-idle/shared/helpers/log';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import type { Metadata } from '../../osu/beatmap/beatmap_api';
import {
	bulkDownload,
	missingSets,
	stopDownloadAll,
} from '../../osu/beatmap/downloadAll';
import { selectedRuleset } from '../../rulesets/registry';
import Button from './controls/Button';
import DownloadAllWarning from './DownloadAllWarning';
import DownloadModeChoice from './DownloadModeChoice';

/** oss!supporter: every bundled or every ranked beatmap in one go, after a warning
 *  on its size. Ranked asks first whether only the picked mode's. */
export default function DownloadAllBeatmaps({ bundled }: { bundled: boolean }) {
	const { t } = useLingui();
	const [progress] = useSynced(bulkDownload);
	const [ruleset] = useSynced(selectedRuleset);
	const [pending, setPending] = useState<Metadata[]>();
	const [choosing, setChoosing] = useState(false);

	const list = async (only?: RulesetId) => {
		setChoosing(false);
		const sets = await missingSets(bundled, only);
		if (!sets.length) {
			return Log.popup(bundled
				? t`Every bundled beatmap is already downloaded.`
				: t`Every ranked beatmap is already downloaded.`);
		}
		setPending(sets);
	};

	const click = () => {
		if (progress) return stopDownloadAll();
		if (bundled) return void list();
		setChoosing(true);
	};

	const done = progress?.done ?? 0;
	const total = progress?.total ?? 0;

	return <>
		<Button
			accent={bundled ? '#2f5f9a' : '#d64045'}
			onClick={click}
			label={progress
				? t`Downloading beatmaps: ${done}/${total} (click to stop)`
				: bundled ? t`Download all bundled beatmaps` : t`Download all ranked beatmaps`}
		/>
		{choosing && <DownloadModeChoice
			ruleset={ruleset}
			onPick={only => void list(only)}
			onClose={() => setChoosing(false)}
		/>}
		{pending && <DownloadAllWarning
			bundled={bundled}
			sets={pending}
			onClose={() => setPending(undefined)}
		/>}
	</>;
}

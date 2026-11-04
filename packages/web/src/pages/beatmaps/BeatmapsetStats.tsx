import {
	faClock,
	faDrum,
	faGripLines,
	faMusic,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Trans } from '@lingui/react/macro';

import { length } from '@oss-idle/shared/display/length';
import {
	bignum,
	bpm,
} from '@oss-idle/shared/display/num';

import {
	type MapDiff,
	previewUrl,
} from '../../api/maps';
import PreviewButton from './PreviewButton';

/** osu!'s stats box: the preview, the basic numbers, then the bars. */
export default function BeatmapsetStats({ setId, diff }: { setId: number; diff: MapDiff }) {
	const basics = [
		{
			icon: faClock, label: <Trans>Length</Trans>, value: length(diff.total_length / 1000),
		},
		{
			icon: faMusic, label: <Trans>BPM</Trans>, value: bpm(diff.bpm),
		},
		{
			icon: faDrum, label: <Trans>Notes</Trans>, value: bignum(diff.rice),
		},
		{
			icon: faGripLines, label: <Trans>Long notes</Trans>, value: bignum(diff.ln),
		},
	];
	const bars = [
		{
			label: <Trans>Keys</Trans>, value: diff.keys, max: 10, text: String(diff.keys),
		},
		{
			label: <Trans>Star rating</Trans>, value: diff.sr, max: 10, text: diff.sr.toFixed(2),
		},
	];
	return <div className='mapset__stats'>
		{diff.audio && <PreviewButton setId={setId} src={previewUrl(setId, diff.audio)} />}
		<div className='mapset__basics'>
			{basics.map((b, i) => <div key={i} className='mapset__basic'>
				<FontAwesomeIcon icon={b.icon} />
				<span>{b.value}</span>
				<span className='mapset__basic-label'>{b.label}</span>
			</div>)}
		</div>
		<table className='mapset__bars'>
			<tbody>
				{bars.map((b, i) => <tr key={i}>
					<th>{b.label}</th>
					<td className='mapset__bar'>
						<span style={{ width: `${Math.min(1, b.value / b.max) * 100}%` }} />
					</td>
					<td>{b.text}</td>
				</tr>)}
			</tbody>
		</table>
	</div>;
}

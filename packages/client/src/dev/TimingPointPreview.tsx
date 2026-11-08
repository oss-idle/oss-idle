import '../editor/editor.css';

import { useState } from 'react';

import Synced from '@oss-idle/shared/helpers/synced';
import type { TimingPoint } from '@oss-idle/shared/rulesets/mania/editor/chart';

import ConfirmPrompt from '../components/ConfirmPrompt';
import EditorTimingPoint from '../editor/EditorTimingPoint';
import type EditorSession from '../editor/session';

const hoveredPoint = new Synced<undefined>(undefined);

/** One BPM point of the editor's timing list, edits applied to it here. */
export default function TimingPointPreview() {
	const [point, setPoint] = useState<TimingPoint>({
		time: 1234, beatLength: 60000 / 180, meter: 4, sound: '', effects: '', snap: 4,
	});
	const session = {
		hoveredPoint,
		seek: () => {},
		updateTimingPoint: (_: TimingPoint, change: Partial<TimingPoint>) => setPoint(p => ({
			...p, ...change,
		})),
		setSectionSnap: () => {},
		setOmitFirstBarLine: () => {},
		removeTimingPoint: () => {},
	} as unknown as EditorSession;
	return (
		<div className="editor__stat editor__timing" style={{ width: 460 }}>
			<EditorTimingPoint key={point.time} session={session} point={point} active={false} />
			<ConfirmPrompt />
		</div>
	);
}

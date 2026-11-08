import '../components/options/controls/Checkbox.css';

import { ph } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import {
	MAX_DIVISOR,
	omitsFirstBarLine,
	type TimingPoint,
} from '@oss-idle/shared/rulesets/mania/editor/chart';

import { askConfirm } from '../components/ConfirmPrompt';
import { SETTINGS } from '../db/settings';
import EditorField from './EditorField';
import type EditorSession from './session';

const round = (n: number) => String(Math.round(n * 1000) / 1000);

/** Above it a BPM asks once: usually a slip of the keyboard, sometimes SV on purpose. */
const MAX_BPM = 1000;

type Props = {
	session: EditorSession,
	point: TimingPoint,
	active: boolean,
	/** its BPM field takes the focus: the point was just added */
	focused?: boolean,
};

/** One BPM point: its time (click the arrow to go there), BPM, beats per bar, the beat snap
 *  its section is mapped in (empty for none) and whether its first bar line shows (osu!'s
 *  omit first bar line, the other way round). */
export default function EditorTimingPoint({
	session, point, active, focused,
}: Props) {
	const { t } = useLingui();
	const bpm = round(60000 / point.beatLength);
	const number = (value: string, use: (n: number) => void) => {
		const n = Number(value);
		if (Number.isFinite(n) && n > 0) use(n);
	};
	const update = (change: Partial<TimingPoint>) => session.updateTimingPoint(point, change);
	// a refused BPM puts the field back on the point's own
	const [refused, setRefused] = useState(0);
	const setBpm = async (n: number) => {
		if (n > MAX_BPM && !SETTINGS.editorHighBpm.get()) {
			const yes = await askConfirm({
				title: t`Set a BPM above ${ph({ max: MAX_BPM })}?`,
				sub: t`BPMs this high are for SV and can slow the editor down. You won't be asked again.`,
				confirmLabel: t`Set it`,
			});
			if (!yes) return setRefused(r => r + 1);
			await SETTINGS.editorHighBpm.set(true);
		}
		update({ beatLength: 60000 / n });
	};
	const nudge = (by: number) => (e: { shiftKey: boolean }) =>
		update({ time: point.time + by * (e.shiftKey ? 10 : 1) });

	return (
		<div
			className={`editor__point ${active ? 'is-active' : ''}`}
			onMouseEnter={() => void session.hoveredPoint.set({
				time: point.time, sv: false,
			})}
			onMouseLeave={() => void session.hoveredPoint.set(undefined)}
		>
			<button
				className="editor__seek-to"
				aria-label={t`Go there`}
				onClick={() => session.seek(point.time)}
			>
				▸
			</button>
			<span className="editor__nudged">
				<button className="editor__nudge" aria-label={t`1 ms earlier, 10 with Shift`} onClick={nudge(-1)}>
					−
				</button>
				<EditorField
					key={`time:${point.time}`}
					type="number"
					label={t`Time (ms)`}
					value={String(point.time)}
					onCommit={v => {
						// 0 or before the song is fine: osu! maps often start there
						const time = Number(v);
						if (v.trim() && Number.isFinite(time)) update({ time: Math.round(time) });
					}}
				/>
				<button className="editor__nudge" aria-label={t`1 ms later, 10 with Shift`} onClick={nudge(1)}>
					+
				</button>
			</span>
			<EditorField
				key={`bpm:${bpm}:${refused}`}
				type="number"
				label={t`BPM`}
				autoFocus={focused}
				value={bpm}
				onCommit={v => number(v, n => void setBpm(n))}
			/>
			<EditorField
				key={`meter:${point.meter}`}
				type="number"
				label={t`Beats per bar`}
				value={String(point.meter)}
				onCommit={v => number(v, meter => update({ meter: Math.round(meter) }))}
			/>
			<EditorField
				key={`snap:${point.snap}`}
				type="number"
				label={t`Beat snap`}
				value={point.snap ? String(point.snap) : ''}
				onCommit={v => {
					const snap = Math.round(Number(v));
					if (!v.trim()) session.setSectionSnap(point, undefined);
					else if (snap >= 1 && snap <= MAX_DIVISOR) session.setSectionSnap(point, snap);
				}}
			/>
			<button
				type="button"
				role="checkbox"
				className={`opt-checkbox editor__check ${omitsFirstBarLine(point) ? '' : 'is-on'}`}
				aria-label={t`Show the first bar line`}
				aria-checked={!omitsFirstBarLine(point)}
				onClick={() => session.setOmitFirstBarLine(point, !omitsFirstBarLine(point))}
			>
				<span className="opt-checkbox__box" aria-hidden>
					<span className="opt-checkbox__tick" />
				</span>
			</button>
			<button
				className="editor__remove"
				aria-label={t`Remove`}
				onClick={() => session.removeTimingPoint(point)}
			>
				×
			</button>
		</div>
	);
}

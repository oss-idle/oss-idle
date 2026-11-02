import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Plural,
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useMemo,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import type {
	CheckId,
	Issue,
} from '@oss-idle/shared/rulesets/mania/editor/checks';

import { clock } from './clock';
import type EditorSession from './session';

/** The map checks, as one line that opens to the list; an issue takes you to its notes. */
export default function EditorChecks({ session }: { session: EditorSession }) {
	const { t } = useLingui();
	useSynced(session.revision);
	const [open, setOpen] = useState(false);
	const snapshot = session.snapshot;
	// again when the chart's file changes too (a new background)
	const issues = useMemo(() => session.checks(), [snapshot, session.chart]);

	const describe = (issue: Issue): string => {
		const n = issue.notes?.length ?? 0;
		const fields = issue.fields?.join(', ') ?? '';
		const text: Record<CheckId, string> = {
			noNotes: t`No notes yet`,
			noTiming: t`No timing point: the beat lines need one`,
			beforeStart: plural(ph({ n }), {
				one: '# note before the song starts', other: '# notes before the song starts', 
			}),
			afterAudio: plural(ph({ n }), {
				one: '# note after the song ends', other: '# notes after the song ends', 
			}),
			overlap: plural(ph({ n }), {
				one: '# note overlaps another in its column', other: '# notes overlap another in their column', 
			}),
			shortLong: plural(ph({ n }), {
				one: '# LN shorter than 1/8 of a beat', other: '# LN shorter than 1/8 of a beat', 
			}),
			allColumns: plural(ph({ n }), {
				one: '# note in a chord across every column', other: '# notes in chords across every column', 
			}),
			unsnapped: plural(ph({ n }), {
				one: '# note off the 1/16 and 1/12 beat lines', other: '# notes off the 1/16 and 1/12 beat lines', 
			}),
			longBreak: t`A break longer than 30 seconds`,
			tooShort: t`Shorter than 30 seconds`,
			noPreview: t`No preview point (Metadata tab)`,
			noBackground: t`No background image`,
			audioFormat: t`The song is not an .mp3 or .ogg file`,
			emptyMetadata: t`Empty metadata: ${fields}`,
			duplicateName: t`Another difficulty has the same name`,
		};
		return text[issue.check];
	};

	const go = (issue: Issue) => {
		if (issue.time !== undefined) session.seek(issue.time);
		if (issue.notes) session.select(issue.notes);
	};

	const errors = issues.filter(issue => issue.level === 'error').length;
	const state = errors ? 'is-error' : issues.length ? 'is-warning' : 'is-clean';

	return (
		<>
			<button className={`editor__small editor__checks-toggle ${state}`} onClick={() => setOpen(o => !o)}>
				{issues.length
					? <Plural
						value={ph({ count: issues.length })}
						one='Checks: # to look at'
						other='Checks: # to look at'
					/>
					: <Trans>Checks: nothing to fix</Trans>}
			</button>
			{open && issues.length > 0 && (
				<ul className="editor__checks">
					{issues.map(issue => (
						<li key={issue.check} className={`is-${issue.level}`}>
							<button disabled={issue.time === undefined && !issue.notes} onClick={() => go(issue)}>
								{describe(issue)}
								{issue.time !== undefined && <kbd>{clock(issue.time)}</kbd>}
							</button>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

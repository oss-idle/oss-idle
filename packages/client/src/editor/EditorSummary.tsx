import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useState } from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import type LightBeatmap from '../osu/beatmap/LightBeatmap';
import { addonTabs } from './addonUi';
import EditorAddonMount from './EditorAddonMount';
import EditorClock from './EditorClock';
import EditorCompose from './EditorCompose';
import EditorDifficulty from './EditorDifficulty';
import EditorHitsounds from './EditorHitsounds';
import EditorMetadata from './EditorMetadata';
import EditorModes from './EditorModes';
import EditorPanelResize from './EditorPanelResize';
import EditorScroll from './EditorScroll';
import EditorScrollTools from './EditorScrollTools';
import EditorSpeed from './EditorSpeed';
import EditorTiming from './EditorTiming';
import EditorViewOptions from './EditorViewOptions';
import type EditorSession from './session';


/** The built-in tabs, then add-ons' by their id. */
type Tab = 'compose' | 'timing' | 'scroll' | 'hitsounds' | 'metadata' | 'view' | `addon.${string}`;

/** The map, where the song is (click the track to seek), then a tab: the beat snap and
 *  counts, the BPM points, or the metadata. */
type Props = {
	session: EditorSession,
	onOpen: (beatmap: LightBeatmap) => void,
	onAdd: (copy: boolean) => void,
};

export default function EditorSummary({ session, onOpen, onAdd }: Props) {
	const { t } = useLingui();
	useSynced(session.revision);
	const [tab, setTab] = useState<Tab>('compose');
	const [addons] = useSynced(addonTabs);
	const addonTab = addons.find(other => other.id === tab);

	const { artist, title, creator } = session.metadata;
	const longNotes = session.notes.filter(note => note.end !== undefined).length;
	const rice = session.notes.length - longNotes;
	const selected = session.selected.size;
	const tabs: [Tab, string][] = [
		['compose', t`Compose`], ['timing', t`Timing`], ['scroll', t`SV`], ['hitsounds', t`Hitsounds`],
		['metadata', t`Metadata`], ['view', t`View`],
		...addons.map(({ id, label }): [Tab, string] => [id as Tab, label]),
	];

	return (
		<aside className="editor__side editor__side--left">
			<EditorPanelResize side="left" />
			<div className="editor__map">
				<span className="editor__title">{title}</span>
				<span className="editor__artist">{artist}</span>
				<EditorDifficulty session={session} onOpen={onOpen} onAdd={onAdd} />
				<span className="editor__creator"><Trans>mapped by {creator}</Trans></span>
			</div>
			<div className="editor__stat editor__time">
				<EditorClock
					session={session}
					marks={tab === 'timing' || tab === 'scroll' ? tab : 'bookmarks'}
				/>
				<span className="editor__counts" data-notes={session.notes.length}>
					<Trans>
						<span className="editor__count">{rice}</span> rice,{' '}
						<span className="editor__count">{longNotes}</span> LN
					</Trans>
					{' · '}{session.chart.keys}K
					{selected > 0 && <>
						{' · '}<span className="editor__selected">{plural(ph({ selected }), {
							one: '# selected',
							other: '# selected',
						})}</span>
					</>}
				</span>
			</div>
			<EditorSpeed session={session} />
			<EditorModes session={session} />
			<div className="editor__tabs">
				{tabs.map(([id, label]) => (
					<button key={id} className={id === tab ? 'is-active' : ''} onClick={() => setTab(id)}>
						{label}
					</button>
				))}
			</div>
			<div className="editor__tab-body">
				{tab === 'compose' && <EditorCompose session={session} />}
				{tab === 'timing' && <EditorTiming session={session} />}
				{tab === 'scroll' && <EditorScrollTools session={session} />}
				{tab === 'scroll' && <EditorScroll session={session} />}
				{tab === 'hitsounds' && <EditorHitsounds session={session} />}
				{tab === 'metadata' && <EditorMetadata session={session} />}
				{tab === 'view' && <EditorViewOptions session={session} />}
				{addonTab && <EditorAddonMount key={addonTab.id} render={addonTab.render} />}
			</div>
		</aside>
	);
}

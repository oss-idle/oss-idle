import type { Note } from '@oss-idle/shared/rulesets/mania/editor/chart';
import { scrollSpeedToMs } from '@oss-idle/shared/rulesets/mania/scroll_speed';

import {
	scrollSpeedOf,
	SETTINGS,
} from '../db/settings';
import type Skin from '../osu/skin/Skin';
import type { EditorSkins } from './editorSkins';
import type { Overlay } from './painter';
import type {
	PlayfieldClock,
	ToPlayfield,
} from './playfieldMessages';
import type EditorSession from './session';
import {
	currentVisuals,
	visualOptions,
} from './visualSetting';

const sameClock = (a: PlayfieldClock | undefined, b: PlayfieldClock) => !!a
	&& a.playing === b.playing && a.pausedAt === b.pausedAt && a.length === b.length
	&& (!b.playing || a.startedAt === b.startedAt);


/** Whether a second field shows beside the editor's: the live preview, or the reference
 *  difficulty in its place. */
export const sideField = (session: EditorSession): boolean =>
	SETTINGS.editorPreview.get() || session.reference !== undefined;

/** The page's end of the playfield's worker (see playfieldWorker): it hands the worker
 *  the canvas, then whatever of the session changed, and only that. */
export default class PlayfieldLink {

	private readonly worker = new Worker(
		new URL('./playfieldWorker.ts', import.meta.url), { type: 'module' },
	);
	private sent: {
		chart?: object, doc?: object, selected?: Set<Note>, view?: string, clock?: PlayfieldClock,
		song?: object, visuals?: object, reference?: object, skins?: string,
	} = {};
	/** the editor skin and the gameplay skin */
	private skinPair?: [Skin, Skin];
	/** both decoded for the chart's key count, as the worker has them */
	public skins?: EditorSkins;

	constructor(canvas: HTMLCanvasElement, private readonly session: EditorSession) {
		this.worker.onerror = e => console.error('[playfield]', e.message);
		const offscreen = canvas.transferControlToOffscreen();
		this.post({
			kind: 'init', canvas: offscreen, dpr: Math.min(window.devicePixelRatio || 1, 2),
		}, [offscreen]);
	}

	private post(message: ToPlayfield, transfer: Transferable[] = []): void {
		this.worker.postMessage(message, transfer);
	}

	public size(w: number, h: number): void {
		this.post({
			kind: 'size', w, h,
		});
	}

	public setSkins(field: Skin, preview: Skin): void {
		this.skinPair = [field, preview];
		this.syncSkins();
	}

	/** Decode both skins for the chart's key count and send them, once they are. */
	private syncSkins(): void {
		if (!this.skinPair) return;
		const [field, preview] = this.skinPair;
		const keys = this.session.chart.keys;
		const key = `${field.id}:${preview.id}:${keys}`;
		if (this.sent.skins === key) return;
		this.sent.skins = key;
		void Promise.all([field.prepare(keys), preview.prepare(keys)]).then(([f, p]) => {
			if (this.sent.skins !== key || !f || !p) return;
			this.skins = {
				field: f, preview: p,
			};
			this.post({
				kind: 'skins', skins: this.skins,
			});
		});
	}

	public overlay(overlay: Overlay): void {
		this.post({
			kind: 'overlay', overlay,
		});
	}

	private selectedIndices(): number[] {
		const { notes, selected } = this.session;
		const indices: number[] = [];
		if (selected.size) notes.forEach((note, i) => selected.has(note) && indices.push(i));
		return indices;
	}

	/** Send what changed since the last call. */
	public sync(): void {
		const { session, sent } = this;
		if (sent.chart !== session.chart) {
			sent.chart = session.chart;
			this.syncSkins();
			this.post({
				kind: 'chart', chart: session.chart,
			});
		}
		if (sent.doc !== session.snapshot) {
			sent.doc = session.snapshot;
			sent.selected = session.selected;
			this.post({
				kind: 'doc', doc: session.snapshot, selected: this.selectedIndices(),
			});
		} else if (sent.selected !== session.selected) {
			sent.selected = session.selected;
			this.post({
				kind: 'select', selected: this.selectedIndices(),
			});
		}
		const view = {
			kind: 'view' as const,
			divisor: session.divisor,
			zoom: session.zoom,
			preview: sideField(session),
			scrollMs: scrollSpeedToMs(scrollSpeedOf(session.beatmap.ruleset()).get()),
			sounds: session.showSounds,
		};
		const viewKey = `${view.divisor}:${view.zoom}:${view.preview}:${view.scrollMs}:${view.sounds}`;
		if (sent.view !== viewKey) {
			sent.view = viewKey;
			this.post(view);
		}
		if (session.song && sent.song !== session.song) {
			sent.song = session.song;
			// a copy, handed over whole: the worker draws the waveform and spectrogram from it
			const pcm = session.song.pcm.slice();
			this.post({
				kind: 'song', pcm, rate: session.song.rate,
			}, [pcm.buffer]);
		}
		const reference = session.reference?.doc;
		if (sent.reference !== reference) {
			sent.reference = reference;
			this.post({
				kind: 'reference', doc: reference,
			});
		}
		const visuals = visualOptions.get();
		if (sent.visuals !== visuals) {
			sent.visuals = visuals;
			this.post({
				kind: 'visuals', options: currentVisuals(),
			});
		}
		const clock = session.clock;
		if (!sameClock(sent.clock, clock)) {
			sent.clock = clock;
			this.post({
				kind: 'clock', clock, sentAt: performance.now(),
			});
		}
	}

	public dispose(): void {
		this.worker.terminate();
	}

}

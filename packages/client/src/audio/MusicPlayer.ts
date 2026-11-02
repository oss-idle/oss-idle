import { Beatmap } from 'osu-classes';

import Listener from '@oss-idle/shared/helpers/listener';
import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import Synced from '@oss-idle/shared/helpers/synced';

import { SETTINGS } from '../db/settings';
import BeatmapStore, { revokeBlob } from '../osu/beatmap/beatmap_store';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import { loadStoryboardAssets } from '../osu/beatmap/storyboard';
import { audioContext } from './audioContext';
import { effects } from './EffectPlayer';
import { preloadSamples } from './hitsounds';
import type { LiveStretchMessage } from './liveStretch.worklet';
import liveStretchUrl from './liveStretch.worklet?worker&url';
import { SampleSchedule } from './SampleSchedule';
import { stretchBuffer } from './stretchBuffer';

export const PLAYER_MODE = mapped(['PLAYLIST', 'LOOP', 'SINGLE']);
export type PlayerMode = ValueIn<typeof PLAYER_MODE>;

/** how far ahead storyboard samples are queued onto the audio clock (ms). Must
 *  exceed the background timer-throttle floor so a hidden tab still queues. */
const SAMPLE_LOOKAHEAD_MS = 1200;
const SAMPLE_TICK_MS = 120;
/** silence kept after the last sound before a track is considered finished. */
const END_PAD_MS = 800;

/** The song a map plays: a set's difficulties mostly share one. */
export const trackOf = (map: LightBeatmap): string =>
	`${map.metadata.runtime ? 'file' : 'clip'}:${map.set.metadata.id}/${map.metadata.audio}`;

export class MusicPlayer {

	public listeners = { beat: new Listener<(beat: number, time: number) => void>() };

	public readonly beatmap = new Synced<LightBeatmap | undefined>(undefined);
	public readonly playing = new Synced(false);
	public readonly mode = new Synced<PlayerMode>(PLAYER_MODE.PLAYLIST);
	/** silenced while something else plays over it (a web page's preview) */
	public readonly muted = new Synced(false);
	
	private _playing = false;
	private raf = new Listener<() => void>();

	private readonly audioSource = new Synced<string | undefined>(undefined);
	/** the track the source was last asked for */
	private track?: string;

	private _audio?: HTMLAudioElement;
	private get audio(): HTMLAudioElement {
		if (!this._audio) {
			this._audio = new Audio();
			this._audio.preload = 'auto';
			// preview clips stream from the API origin; without CORS the element feeds
			// the (cross-origin) audio graph silence. Must be set before any src.
			this._audio.crossOrigin = 'anonymous';
			this._audio.volume = 1; // real volume is handled by the gain node
		}
		return this._audio;
	}
	
	constructor() {
		this.context = this.getAudioContext();

		this.beatmap.sync(async beatmap => {
			const track = beatmap && trackOf(beatmap);
			// another difficulty of the same song: the song goes on
			if (track && track === this.track) return void this.loadTimeline(beatmap);
			this.track = track;
			const src = await this.getAudioSource(beatmap);
			// reads finish out of order when the selection moves on quickly
			if (beatmap !== this.beatmap.get()) return revokeBlob(src);
			await this.audioSource.set(src);
			void this.loadTimeline(beatmap);
		});

		this.audioSource.sync(async (src, previous) => {
			revokeBlob(previous);
			delete this.lastBeat;

			if (!src) {
				// no backing track (virtual map): clear the element so syncAudio won't
				// replay the previous map's audio. The samples drive playback instead.
				this.audio.pause();
				this.audio.removeAttribute('src');
				this.audio.load();
				return;
			}

			this.audio.src = src;
		});

		Synced.all([
			SETTINGS.mainVolume,
			SETTINGS.musicVolume,
			this.muted,
		], () => {
			if (!this._gain) return;
			this._gain.gain.setTargetAtTime(this.volume(), this.context.currentTime, 0.05);
		});

		this.initBeatDetection();
		this.initRaf();
		this.initSampleScheduler();
	}

	// ---- virtual timeline (menus / preview) ----
	// The song position is a virtual clock spanning the whole beatmap, not just
	// the audio file: it runs through blanks before/after the audio and works for
	// no-audio ("virtual") maps whose sound is entirely storyboard samples. The
	// <audio> element is a slave - started when the position enters its range,
	// left to end on its own - while the position keeps advancing on the shared
	// AudioContext clock. Storyboard samples are scheduled on the effects channel.
	private speed = 1; // how fast the streaming track plays (the picked rate)
	private anchorPos = 0; // song position (ms) at anchorCtx
	private anchorCtx = 0; // AudioContext time (s) the anchor was taken
	private pausePos?: number; // frozen position while paused
	private advancing = false; // guards against re-firing next/loop at the end
	private sampleStart = 0;
	private sampleEnd = 0;
	private samples?: SampleSchedule;

	private songStart(): number {
		return Math.min(0, this.sampleStart);
	}

	/** Decode the map's storyboard samples, preload them, and record the timeline
	 *  bounds. Runtime (downloaded) maps only - others have no bundled samples. */
	private async loadTimeline(map: LightBeatmap | undefined): Promise<void> {
		this.samples = undefined;
		this.sampleStart = 0;
		this.sampleEnd = 0;
		if (!map || !map.metadata.runtime) return;
		try {
			const beatmap = await map.load();
			if (!this.beatmap.get()?.is(map.metadata.id)) return; // a newer track was selected
			const assets = await loadStoryboardAssets(map, beatmap);
			if (!this.beatmap.get()?.is(map.metadata.id)) return;
			// a virtual (no-audio) map's song is its keysounds + storyboard samples, so
			// play both in the menu. A normal map's keysounds are gameplay-only.
			const menu = this.audioSource.get()
				? assets.samples
				: [...assets.samples, ...assets.keysounds].sort((a, b) => a.time - b.time);
			this.samples = new SampleSchedule(menu);
			this.sampleStart = menu.length ? menu[0].time : 0;
			this.sampleEnd = menu.reduce((m, s) => Math.max(m, s.time), 0);
			// this runs after the track has already been told to play - a preview
			// starts at the map's preview point, not at 0 - so seat the pointer where
			// playback actually is. Without it the schedule starts from the top of
			// the map and fires samples the preview has long passed.
			if (this._playing) this.samples.resync(this.time());
			await preloadSamples(map.set.metadata.id, menu);
		} catch (e) {
			console.warn('[music] storyboard load failed', e);
		}
	}

	/** Start, seek or stop the slave <audio> element to track the virtual position.
	 *  Past the end of the track it stays silent and the clock carries on, but a
	 *  position back inside the track starts it again - a replay of the same map
	 *  used to leave the element `ended` for good, so only the samples came back. */
	private syncAudio(pos: number): void {
		if (!this.audio.src) return; // no backing track (virtual map)
		if (pos < 0) {
			if (!this.audio.paused) this.audio.pause();
			return;
		}
		if (!this.audio.paused) return;
		const durationMs = isFinite(this.audio.duration) ? this.audio.duration * 1000 : undefined;
		if (durationMs !== undefined && pos >= durationMs) return; // genuinely past it
		if (Math.abs(this.audio.currentTime * 1000 - pos) > 250) 
			this.audio.currentTime = pos / 1000;
		void this.audio.play().catch(() => {});
	}

	/**
	 * Whether the virtual position has passed the end of every sound (audio +
	 * samples). While the audio is still loading or playing the song never ends.
	 */
	private atEnd(pos: number): boolean {
		const hasAudio = !!this.audio.src;
		const audioMs = isFinite(this.audio.duration) ?
			this.audio.duration * 1000 
			: undefined;
		if (hasAudio && (audioMs === undefined || (!this.audio.ended && pos < audioMs)))
			return false;
		return pos >= Math.max(audioMs ?? 0, this.sampleEnd) + END_PAD_MS;
	}

	/** Drive the slave audio, queue storyboard samples, and advance at the end.
	 *  A timer (not rAF) so it keeps running while the tab is hidden. Idle during
	 *  gameplay, which owns its own buffer clock (see playGameplay / gameTime). */
	private initSampleScheduler(): void {
		setInterval(() => {
			if (this.gameStartCtx != null) return; // gameplay buffer owns the clock
			if (!this._playing) return;
			if (!this.beatmap.get()) return;
			const pos = this.time();
			this.syncAudio(pos);
			const pitch = this.audio.preservesPitch ? 1 : this.speed;
			this.samples?.queue(pos, SAMPLE_LOOKAHEAD_MS, this.speed, pitch);
			if (this.atEnd(pos) && !this.advancing) {
				this.advancing = true;
				this.handleEnded();
			}
		}, SAMPLE_TICK_MS);
	}

	private _gain?: GainNode;
	private _analyser?: AnalyserNode;
	private _source?: MediaElementAudioSourceNode;
	private _freqData?: Uint8Array<ArrayBuffer>;
	private context: AudioContext;
	private getAudioContext() {
		const ctx = audioContext;
		this._source = ctx.createMediaElementSource(this.audio);
		this._gain = ctx.createGain();
		this._gain.gain.value = this.volume();
		this._analyser = ctx.createAnalyser();
		this._analyser.fftSize = 256;
		this._analyser.smoothingTimeConstant = 0.78;
		this._freqData = new Uint8Array(this._analyser.frequencyBinCount);
		this._source.connect(this._analyser);
		this._analyser.connect(this._gain);
		this._gain.connect(ctx.destination);

		return ctx;
	}
	
	private async getAudioSource(
		map: LightBeatmap | undefined,
	): Promise<string | undefined> {
		if (!map) return;
		return BeatmapStore.getBeatmapAudio(map);
	}

	private handleEnded(): void {
		switch (this.mode.get()) {
			case PLAYER_MODE.LOOP:
				this.play(0);
				break;
			case PLAYER_MODE.PLAYLIST:
				this.next();
				break;
		}
	};

	private lastBeat?: number;
	private currentBeatmapId = -1;
	private currentBeatmap?: Beatmap;
	private initBeatDetection() {
		this.raf.on(() => {
			const beatmap = this.beatmap.get();

			if (!beatmap || !beatmap.metadata.runtime) {
				this.currentBeatmapId = -1;
				delete this.currentBeatmap;
				return;
			}
			if (!beatmap.is(this.currentBeatmapId)) {
				this.currentBeatmapId = beatmap.metadata.id;
				delete this.currentBeatmap;
				beatmap.load().then(beatmap => this.currentBeatmap = beatmap);
			}
			if (!this.currentBeatmap) return;

			const ms = this.time();
			const timingPoint = this.currentBeatmap.controlPoints.timingPointAt(ms);
			if (!timingPoint) return;

			const beat = Math.floor((ms - timingPoint.startTime) / timingPoint.beatLength);

			// before the first timing point (the "drop") - no beats yet
			if (beat < 0) return; 
			if (this.lastBeat === beat) return;

			this.lastBeat = beat;
			this.listeners.beat.trigger(beat, ms);
		});
	}

	/** Fully buffer the current streaming track and pre-seek it to `atMs` so a
	 *  later play() at that position starts instantly instead of stalling on a
	 *  cold load/seek. Best-effort: resolves as soon as the position is playable.
	 *  (The src is set by the beatmap/audioSource sync, so call after awaiting
	 *  `beatmap.set`.) */
	async preload(atMs = 0): Promise<void> {
		const audio = this.audio;
		if (!audio.src) return;
		const ready = (state: number, event: string) => audio.readyState >= state
			? Promise.resolve()
			: new Promise<void>(resolve => audio.addEventListener(event, 
				() => resolve(), 
				{ once: true },
			));
		await ready(1 /* HAVE_METADATA */, 'loadedmetadata');
		if (atMs > 0) audio.currentTime = atMs / 1000;
		await ready(3 /* HAVE_FUTURE_DATA */, 'canplay');
	}

	async play(atMs?: number) {
		// A play owns the output while it is running: its decoded buffer is a
		// second source, and starting the streaming element under it is two songs
		// at once. Only a track riding out after the play ended gives way (below).
		if (this.gameSource && !this.gameRiding) return;
		if (this.gameRiding) this.stopRiding();
		if (this.context.state === 'suspended') await this.context.resume();
		const pos = atMs ?? this.pausePos ?? this.songStart();
		this.anchorPos = pos;
		this.anchorCtx = this.context.currentTime;
		this.pausePos = undefined;
		this.advancing = false;
		this._playing = true;
		this.samples?.resync(pos);
		effects.stopAll();
		this.syncAudio(pos);
		await this.playing.set(true);
	}

	pause() {
		if (this.gameRiding) this.stopRiding();
		this.pausePos = this.time();
		this._playing = false;
		this.audio.pause();
		effects.stopAll();
		this.playing.set(false);
	}

	stop() {
		if (this.gameRiding) this.stopRiding();
		this._playing = false;
		this.audio.pause();
		this.audio.currentTime = 0;
		this.pausePos = this.songStart();
		effects.stopAll();
		this.playing.set(false);
	}

	// Recently played tracks, so `previous()` can step back through the shuffle.
	private history: LightBeatmap[] = [];

	async next() {
		const all = (await BeatmapStore.getAllSets()).flatMap(set => set.getPickedBeatmaps());
		if (!all.length) return;
		const current = music.beatmap.get();
		// the intro is never stepped back to
		if (current?.isPlayable()) this.history = [...this.history, current].slice(-50);
		await music.beatmap.set(all[Math.floor(Math.random() * all.length)]);
		await music.play(0);
	}

	/** Step back to the previously played track, or restart the current one if
	 *  there's no history (matching osu!'s previous button). */
	async previous() {
		const prev = this.history.pop();
		if (!prev) return this.restart();
		await music.beatmap.set(prev);
		await music.play(0);
	}

	time() {
		// during gameplay the buffer clock is authoritative
		if (this.gameStartCtx != null) return this.gameTime();
		if (!this._playing) return this.pausePos ?? this.songStart();
		// while the slave audio is actively playing, trust it and re-anchor the
		// virtual clock to it - so the audio region is drift-free and the blanks
		// before/after it continue smoothly from the same position.
		if (
			this.audio.src 
			&& !this.audio.paused 
			&& !this.audio.ended 
			&& this.audio.currentTime > 0
		) {
			this.anchorPos = this.audio.currentTime * 1000;
			this.anchorCtx = this.context.currentTime;
			return this.anchorPos;
		}
		return this.anchorPos + (this.context.currentTime - this.anchorCtx) * 1000 * this.speed;
	}

	/** Play the streaming track (menus, song select, screensaver) this much faster;
	 *  `keepPitch` holds its pitch. Takes effect at once. */
	setSpeed(speed: number, keepPitch: boolean): void {
		if (speed === this.speed && this.audio.preservesPitch === keepPitch) return;
		this.anchorPos = this.time();
		this.anchorCtx = this.context.currentTime;
		this.speed = speed;
		// a new track resets playbackRate to the default one, so set both
		this.audio.defaultPlaybackRate = speed;
		this.audio.playbackRate = speed;
		this.audio.preservesPitch = keepPitch;
	}

	/** true once the underlying audio element has played past its end */
	ended(): boolean {
		return !!this._audio?.ended;
	}

	seek(ms: number) {
		this.anchorPos = ms;
		this.anchorCtx = this.context.currentTime;
		if (!this._playing) this.pausePos = ms;
		this.samples?.resync(ms);
		effects.stopAll();
		if (!this.audio.src) return;
		if (ms < 0) {
			if (!this.audio.paused) this.audio.pause();
		} else {
			this.audio.currentTime = ms / 1000;
		}
	}

	// ---- gameplay buffer playback ----
	// Gameplay needs music and hitsounds on one sample-accurate clock, so the
	// track is decoded to an AudioBuffer and played through the SAME AudioContext
	// as the hitsounds (see audioContext.ts) - but still through the music gain
	// node, so it keeps the music volume, not the effects volume. The streaming
	// <audio> element above is left untouched and still drives menu / preview.
	private gameBuffer?: AudioBuffer;
	private gameSource?: AudioBufferSourceNode;
	/** context time (s) that maps to song position 0; undefined = not started */
	private gameStartCtx?: number;
	/** true while a finished play's track is allowed to keep playing to its
	 *  natural end (see endGameplay) instead of being cut at the result screen */
	private gameRiding = false;
	/** how fast the gameplay buffer plays: the rate, or 1 when the buffer was
	 *  stretched to it beforehand to keep its pitch */
	private gameSpeed = 1;
	/** the last stretched track, so a retry of the same map doesn't stretch again */
	private stretched?: { track: string, rate: number, buffer: AudioBuffer };
	/** the last decoded track, so another speed doesn't fetch and decode it again */
	private decoded?: { track: string, buffer: Promise<AudioBuffer | undefined> };
	/** the track stretched as it plays (see liveStretch.worklet), for a kept pitch */
	private live?: { node: Promise<AudioWorkletNode>, loaded?: AudioBuffer };
	private liveNode?: AudioWorkletNode;
	private livePlaying = false;
	/** bumped by every stop, so a track still decoding for a play that ended is dropped */
	private prepares = 0;

	/**
	 * Decode the gameplay track up front (during the silent lead-in) so it can be
	 * started sample-accurately. Resolves to false for keysound maps (no track).
	 * At a rate the track speeds up; unless its pitch follows, it is stretched to
	 * that speed first, on the same clock as everything else.
	 */
	async prepareGameplay(
		map: LightBeatmap,
		rate = 1,
		pitchFollows = true,
		/** a kept pitch is stretched as it plays, not first: a new speed is heard at once */
		live = false,
	): Promise<boolean> {
		// the decoded track stays: another speed of the same song needs no decoding again
		this.stopTrack();
		const call = this.prepares;
		try {
			const prepared = await this.decodeGameplay(map, rate, pitchFollows || live);
			if (!prepared || call !== this.prepares) return false;
			const stretched = rate !== 1 && !pitchFollows && live;
			const node = stretched ? await this.liveTrack(prepared.buffer) : undefined;
			if (call !== this.prepares) return false;
			this.liveNode = node;
			this.gameBuffer = prepared.buffer;
			this.gameSpeed = prepared.speed;
			return true;
		} catch (e) {
			// the play goes on without its track rather than stay behind the loading screen
			console.warn('[music] gameplay track failed', e);
			return false;
		}
	}

	private async decodeGameplay(map: LightBeatmap, rate: number, pitchFollows: boolean) {
		// by set and file: a stored file's URL is a new one at every ask
		const track = `${map.set.metadata.id}/${map.metadata.audio}`;
		const kept = rate !== 1 && !pitchFollows;
		// a retry at the same rate: stretched already, nothing to read or decode
		if (kept && this.stretched?.track === track && this.stretched.rate === rate) {
			return {
				buffer: this.stretched.buffer, speed: 1,
			};
		}
		if (this.decoded?.track !== track) {
			const buffer = this.getAudioSource(map).then(async url => {
				if (!url) return undefined;
				try {
					return await this.context.decodeAudioData(await (await fetch(url)).arrayBuffer());
				} finally {
					revokeBlob(url);
				}
			});
			this.decoded = {
				track, buffer,
			};
			buffer.catch(() => { if (this.decoded?.buffer === buffer) this.decoded = undefined; });
		}
		const decoded = await this.decoded.buffer;
		if (!decoded) return undefined;
		if (!kept) return {
			buffer: decoded, speed: rate,
		};
		this.stretched = {
			track, rate, buffer: await stretchBuffer(this.context, decoded, rate),
		};
		return {
			buffer: this.stretched.buffer, speed: 1, 
		};
	}

	/** The live stretcher, holding `track`: made once, sent each new track once. */
	private async liveTrack(track: AudioBuffer): Promise<AudioWorkletNode> {
		this.live ??= {
			node: this.context.audioWorklet.addModule(liveStretchUrl).then(() => {
				const node = new AudioWorkletNode(this.context, 'live-stretch', {
					numberOfInputs: 0, outputChannelCount: [2],
				});
				node.connect(this._analyser!);
				return node;
			}),
		};
		const live = this.live;
		// a failed setup is tried again next time
		live.node.catch(() => { if (this.live === live) this.live = undefined; });
		const node = await live.node;
		if (live.loaded !== track) {
			live.loaded = track;
			const channels = Array.from({ length: track.numberOfChannels }, (_, c) => track.getChannelData(c));
			node.port.postMessage({
				type: 'load', channels, 
			} satisfies LiveStretchMessage);
		}
		return node;
	}

	/** Start the prepared track so song position `atMs` is heard now. Restarting
	 *  (e.g. an intro skip) is fine - it just re-anchors. `atMs` beyond the track
	 *  length plays no sound but still anchors the clock so the play can resolve. */
	playGameplay(atMs = 0): void {
		if (!this.gameBuffer) return;
		if (this.context.state === 'suspended') void this.context.resume();
		this.disposeGameSource();

		const when = this.context.currentTime;
		this.gameStartCtx = when - Math.max(0, atMs / 1000);
		// song position is real time; the track runs `gameSpeed` times faster
		const offset = Math.max(0, atMs / 1000) * this.gameSpeed;
		this._playing = true;
		this.playing.set(true);

		if (offset >= this.gameBuffer.duration) return; // past the end: clock only
		if (this.liveNode) {
			const at = offset * this.gameBuffer.sampleRate;
			this.liveNode.port.postMessage({
				type: 'play', at, when, rate: this.gameSpeed,
			} satisfies LiveStretchMessage);
			this.livePlaying = true;
			return;
		}
		const src = this.context.createBufferSource();
		src.buffer = this.gameBuffer;
		src.playbackRate.value = this.gameSpeed;

		// → music gain → destination (volume + visualiser)
		src.connect(this._analyser!);
		src.start(when, offset);
		this.gameSource = src;
	}

	/** Silence the playing gameplay track but keep the decoded buffer so it can be
	 * restarted from a given position (debug pause / seek) Resume with playGameplay
	 */
	pauseGameplay(): void {
		this.disposeGameSource();
	}

	/** How long until audio scheduled now is heard, in ms: the output's own latency
	 *  (tens of ms on Windows). A clock that isn't the audio's starts the track this
	 *  far ahead of what it shows, so the song is heard where it's drawn. */
	outputDelay(): number {
		const { contextTime, performanceTime } = this.context.getOutputTimestamp();
		if (contextTime && performanceTime) {
			const heard = contextTime + (performance.now() - performanceTime) / 1000;
			return Math.max(0, (this.context.currentTime - heard) * 1000);
		}
		return ((this.context.outputLatency || 0) + this.context.baseLatency) * 1000;
	}

	/** The prepared gameplay track (stretched when a speed keeps its pitch). */
	gameplayAudio(): AudioBuffer | undefined {
		return this.gameBuffer;
	}

	/** The prepared gameplay track's length in song ms; 0 when none is prepared. */
	gameDuration(): number {
		return this.gameBuffer ? this.gameBuffer.duration * 1000 / this.gameSpeed : 0;
	}

	/** Gameplay song position (ms) from the shared audio clock. Advances smoothly
	 *  forever - even past the track end - so the final notes always resolve. */
	gameTime(): number {
		return this.gameStartCtx == null ? 0 
			: (this.context.currentTime - this.gameStartCtx) * 1000;
	}

	/** End the play but let the decoded track keep playing to its natural end -
	 *  no cut, no restart - so the result screen hears it continue seamlessly.
	 *  When the buffer reaches its end (or a new song is requested, see play /
	 *  stopRiding) playback hands back to the streaming element. */
	endGameplay(): void {
		// The track is usually shorter than the map (silent outro after the last
		// note), so by the time the play ends the buffer has often already finished
		// - its onended has fired and won't fire again. Only ride it out while it's
		// genuinely still playing; otherwise (or for keysound maps with no source)
		// behave as before: release and hand straight back to the streamer.
		const stillPlaying = this.gameSource 
			&& this.gameBuffer
			&& this.gameStartCtx != null
			&& this.gameTime() < this.gameBuffer.duration / this.gameSpeed * 1000;
		if (!stillPlaying) {
			this.stopGameplay();
			this.pause();
			return;
		}
		this.gameRiding = true;
		if (this.gameSource) this.gameSource.onended = () => {
			// ignore if this source was already torn down for a new play/song
			if (!this.gameRiding) return;
			this.stopRiding();
			this.pause();
		};
	}

	/** Tear down the gameplay buffer source and release the decoded track. */
	stopGameplay(): void {
		this.stopTrack();
		// a whole song is tens of MB: kept only while it is in use
		this.decoded = undefined;
	}

	/** Forget the decoded and stretched song: its file changed under the same name. */
	forgetTrack(): void {
		this.track = undefined;
		this.decoded = undefined;
		this.stretched = undefined;
	}

	/** Let go of the song the live stretcher holds (the editor closed). */
	releaseLiveStretch(): void {
		if (!this.live) return;
		this.live.loaded = undefined;
		const unload: LiveStretchMessage = { type: 'unload' };
		void this.live.node.then(node => node.port.postMessage(unload));
	}

	private stopTrack(): void {
		this.prepares++;
		this.gameRiding = false;
		this.disposeGameSource();
		this.gameBuffer = undefined;
		this.liveNode = undefined;
		this.gameStartCtx = undefined;
		this._playing = false;
		this.playing.set(false);
	}

	/** Drop a riding-out gameplay track without touching the playing flags - used
	 *  when streaming takes over, so there's no transient pause/flicker. */
	private stopRiding(): void {
		this.gameRiding = false;
		this.disposeGameSource();
		this.gameBuffer = undefined;
		this.gameStartCtx = undefined;
	}

	private disposeGameSource(): void {
		if (this.livePlaying) {
			this.livePlaying = false;
			this.liveNode?.port.postMessage({ type: 'stop' } satisfies LiveStretchMessage);
		}
		if (!this.gameSource) return;
		// we're stopping it deliberately, don't hand back
		this.gameSource.onended = null;
		try { this.gameSource.stop(); } catch { /* already stopped/ended */ }
		this.gameSource.disconnect();
		this.gameSource = undefined;
	}
	
	/** Normalised (0..1) frequency magnitudes for the visualiser, or null. */
	private spectrum?: Float32Array;

	/** The spectrum now, 0..1 per bin: one array filled again each call (read it before
	 *  the next), since a new one each frame is garbage. */
	getSpectrum(): Readonly<Float32Array> | null {
		if (!this._analyser || !this._freqData) return null;
		this._analyser.getByteFrequencyData(this._freqData);
		const spectrum = this.spectrum ??= new Float32Array(this._freqData.length);
		for (let i = 0; i < spectrum.length; i++) spectrum[i] = this._freqData[i] / 255;
		return spectrum;
	}

	changeGain(target: number, ms: number, from?: number): void {
		if (!this._gain || !this.context) return;
		const now = this.context.currentTime;
		const g = this._gain?.gain;
		g.cancelScheduledValues(now);
		g.setValueAtTime(from ?? g.value, now);
		g.linearRampToValueAtTime(target, now + Math.max(0.001, ms / 1000));
	}

	fadeOut(ms = 320): void {
		this.changeGain(0, ms);
	}

	/** Ramp from silence up to the current music volume - used to soften an abrupt
	 *  start when playback begins mid-song (e.g. the random startup track). */
	fadeIn(ms = 800): void {
		this.changeGain(this.volume(), ms, 0);
	}

	private volume(): number {
		return this.muted.get() ? 0 : SETTINGS.musicVolume.get() * SETTINGS.mainVolume.get();
	}

	private initRaf() {
		const tick = async () => {
			await this.raf.trigger();
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	restart() {
		this.pause();
		this.play(0);
	}
	
	async toggle() {
		if (this._playing) this.pause(); else await this.play();
	}
}

// HMR Reuse instance
const globalStore = globalThis as unknown as { __ossIdleMusic?: MusicPlayer };
 
export const music: MusicPlayer = globalStore.__ossIdleMusic ?? new MusicPlayer();
globalStore.__ossIdleMusic = music;
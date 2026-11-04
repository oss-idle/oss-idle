import { t } from '@lingui/core/macro';

import Synced from '@oss-idle/shared/helpers/synced';
import {
	advanceQueue,
	AUTOPILOT_MODE,
	type AutopilotMode,
	playsOnce,
	type QueueEdit,
	type QueueEntry,
	type QueueSource,
	type QueueState as ServerQueueState,
	withRepeat,
} from '@oss-idle/shared/queue';

import {
	Playlist,
	PlaylistEntry,
} from '../db/schema/playlist';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import Socket from '../online/socket';
import BeatmapAPI from '../osu/beatmap/beatmap_api';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import LightBeatmapSet from '../osu/beatmap/LightBeatmapSet';
import { canPlayAt } from './playRate';
import { requeue } from './requeue';

export {
	AUTOPILOT_MODE,
	AutopilotModes,
	type AutopilotMode,
	type QueueSource,
} from '@oss-idle/shared/queue';

export const autopilotModeLabels = (): Record<AutopilotMode, string> => ({
	[AUTOPILOT_MODE.DISABLED]: t`Disabled`,
	[AUTOPILOT_MODE.PLAYLIST]: t`Playlist`,
	[AUTOPILOT_MODE.NEXT]: t`Next song`,
	[AUTOPILOT_MODE.SHUFFLE]: t`Shuffle`,
	[AUTOPILOT_MODE.LOOP]: t`Loop`,
});

/** A map waiting to play, with its repeat run. */
export type Queued = Pick<QueueEntry, 'repeat' | 'played'> & { beatmap: LightBeatmap };

export type QueueState = QueueSource & {
	/** what is waiting to play, in play order. The head is what plays next. */
	entries: Queued[];
};

/** Fisher-Yates, on a copy. */
const shuffled = <T>(entries: T[]): T[] => {
	const out = [...entries];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

/**
 * Fill the queue for a map launched from song select, per the autopilot mode:
 *   DISABLED - nothing
 *   LOOP     - replay this one map forever
 *   PLAYLIST - chain the launched playlist group if grouped by playlist
 *   NEXT     - chain in song-select order: the open group when grouped,
 *              otherwise the whole search-filtered list
 *   SHUFFLE  - same pool as NEXT, in a random order
 */
export const fillQueue = (beatmap: LightBeatmap, from: {
	mode: AutopilotMode;
	groupKey?: string;
	label: string;
	playlists: boolean;
	pool: Queued[];
}): void => {
	const { mode, groupKey } = from;
	if (mode === AUTOPILOT_MODE.DISABLED) return;
	if (mode === AUTOPILOT_MODE.LOOP) {
		PlayQueue.start({
			label: beatmap.set.metadata.title, mode, groupKey,
		}, [{ beatmap }], 0);
		return;
	}
	if (mode === AUTOPILOT_MODE.PLAYLIST && !from.playlists) return;
	const pool = from.pool.filter(q => canPlayAt(q.beatmap.lockedRate));
	const index = pool.findIndex(q => q.beatmap.is(beatmap));
	if (index < 0) return;
	PlayQueue.start({
		label: from.label, mode, groupKey,
	}, pool, index);
};

const once = (mode?: AutopilotMode): boolean => playsOnce(SETTINGS.queuePlayOnce.get(), mode);

/** Only a downloaded map can be played, so only a downloaded map can wait in
 *  the queue - that is what keeps "the head is next" honest. */
const playable = (entries: Queued[]): Queued[] =>
	entries.filter(e => e.beatmap.metadata.runtime);

const toEntry = ({ beatmap, repeat, played }: Queued): QueueEntry => ({
	beatmapId: beatmap.metadata.id, rate: beatmap.lockedRate, mods: beatmap.lockedMods, repeat, played,
});

/** The entry at `at`, named as the server finds it among the map's copies. */
const refAt = (entries: Queued[], at: number) => ({
	...toEntry(entries[at]),
	nth: entries.slice(0, at).filter(e => e.beatmap.is(entries[at].beatmap)).length,
});

/** The playlist a queue plays: song select keys a playlist group `p<id>`. */
const playlistOf = (s?: QueueSource): number | undefined => {
	const fromList = s?.mode === AUTOPILOT_MODE.PLAYLIST || s?.mode === AUTOPILOT_MODE.SHUFFLE;
	const id = fromList ? s.groupKey?.match(/^p(\d+)$/)?.[1] : undefined;
	return id === undefined ? undefined : Number(id);
};

const playlistRows = (id: number): Promise<PlaylistEntry[]> => PlaylistEntry.query(
	'SELECT * FROM playlist_entry WHERE playlistId = ? ORDER BY position, rowid', [id],
);

/** A playlist's entries in order, compared as a whole. */
const contents = (rows: PlaylistEntry[]): string =>
	rows.map(r => `${r.beatmapId}@${r.rate ?? 0}+${r.mods.join('')}x${r.repeat}`).join();

/** A signed-in character's queue is the server's; a guest's lives here. */
const online = (): boolean => {
	const character = Entities.character.get();
	return !!character && !character.isGuest();
};

/** The maps the server's entries name, the downloaded copy first. One this
 *  device has never heard of stays on the server, just not in this view. */
const resolve = async (entries: QueueEntry[]): Promise<Queued[]> => {
	const byId = new Map<number, LightBeatmap>();
	const add = (sets: LightBeatmapSet[]) => {
		for (const b of sets.flatMap(s => s.beatmaps)) {
			if (!byId.has(b.metadata.id)) byId.set(b.metadata.id, b);
		}
	};
	add(await BeatmapStore.getAllSets());
	if (entries.some(e => !byId.has(e.beatmapId))) {
		const manifest = await BeatmapAPI.getManifest().catch(() => undefined);
		if (manifest) add(manifest.beatmaps.map(m => LightBeatmapSet.fromMetadata(m)));
	}
	return entries.flatMap(({ beatmapId, rate, mods, repeat, played }) => {
		const beatmap = byId.get(beatmapId)?.at(rate, mods);
		return beatmap ? [{
			beatmap, repeat, played,
		}] : [];
	});
};

/**
 * What the character plays next, and after that.
 *
 * The queue is exactly what it looks like: a list of maps waiting, and the one
 * at the top is the one that plays next. Reordering it changes what happens
 * next, immediately - otherwise ordering it would be decoration. The map that
 * is *playing* is not in here; it is the live play (see PlayManager).
 *
 * It cycles rather than draining: a map that starts goes to the back, so a
 * playlist loops the way autopilot always has. Emptying it is what stops the
 * loop - "stop after this play". With play once, a map that starts leaves it
 * instead, and the queue stops after its last map.
 *
 * Signed in, it lives on the server, which chains it whether or not the game is
 * open (spec/queue.md §9): every edit goes there, and `state` is what the
 * server last pushed. A guest's lives in memory and dies with the tab.
 */
export default class PlayQueue {

	public static state = new Synced<QueueState | undefined>(undefined);

	/** Each push resolves on its own; an older one landing late must not win. */
	private static received = 0;

	/** The queue's playlist when it was first seen queued, so the queue's own
	 *  edits never read as the playlist changing. */
	private static queued: { id: number, contents: string } | undefined;

	/** Another identity took over: its queue arrives with its own push. */
	public static reset(): void {
		this.received++;
		this.queued = undefined;
		if (this.state.get()) void this.state.set(undefined);
	}

	/** Show what the server holds. */
	public static async receive(state: ServerQueueState): Promise<void> {
		const seq = ++this.received;
		const entries = await resolve(state.entries);
		if (seq !== this.received) return;
		void this.state.set(state.entries.length ? {
			label: state.label,
			mode: state.mode,
			groupKey: state.groupKey,
			entries,
		} : undefined);
	}

	/**
	 * Fill the queue from a pool, with `index` the map being launched right now:
	 * it drops to the back, and everything after it comes first. Shuffle
	 * reorders it once, here. Played once, it stops at the pool's end; shuffled,
	 * every other map plays once.
	 */
	public static start(
		source: QueueSource,
		pool: Queued[],
		index: number,
	): void {
		const launched = pool[index];
		const shuffle = source.mode === AUTOPILOT_MODE.SHUFFLE;
		const playOnce = once(source.mode);
		const rest = playable([
			...pool.slice(index + 1),
			...playOnce && !shuffle ? [] : pool.slice(0, index),
		]);
		const ordered = shuffle ? shuffled(rest) : rest;
		this.queued = undefined;
		// the launched map comes round again at the back, so a single-map queue
		// (LOOP) repeats and a playlist wraps
		const entries = launched?.beatmap.metadata.runtime && !playOnce ? [...ordered, launched] : ordered;
		void this.state.set({
			...source, entries,
		});
		if (online()) {
			void Socket.sendSoon({
				type: 'queue:set', source, entries: entries.map(toEntry),
			});
		}
	}

	/**
	 * Whether the queue's playlist was edited since it was queued: the queue is a
	 * copy taken at launch, so it keeps playing the old list. The first look at a
	 * queue takes what its playlist holds then.
	 */
	public static async playlistChanged(): Promise<boolean> {
		const id = playlistOf(this.state.get());
		if (id === undefined) return false;
		const rows = await playlistRows(id);
		const now = contents(rows);
		if (this.queued?.id !== id) this.queued = {
			id, contents: now,
		};
		return rows.length > 0 && this.queued.contents !== now;
	}

	/** Rebuild the queue from its playlist as it is now, in the queue's own mode
	 *  ({@link requeue}). */
	public static async refreshFromPlaylist(): Promise<void> {
		const id = playlistOf(this.state.get());
		if (id === undefined) return;
		const [playlist, rows] = await Promise.all([
			Playlist.first('SELECT * FROM playlist WHERE id = ?', [id]),
			playlistRows(id),
		]);
		const pool = playable(await resolve(rows.map(r => ({
			beatmapId: r.beatmapId, rate: r.rate, mods: r.rate === undefined ? undefined : r.mods,
			repeat: r.repeat > 1 ? r.repeat : undefined,
		})))).filter(q => canPlayAt(q.beatmap.lockedRate));
		const s = this.state.get();
		if (!playlist || !s || playlistOf(s) !== id || !pool.length) return;
		this.queued = {
			id, contents: contents(rows),
		};
		const entries = requeue(
			pool, s.entries, (a, b) => a.beatmap.is(b.beatmap),
			s.mode === AUTOPILOT_MODE.SHUFFLE ? shuffled : undefined,
			once(s.mode),
		);
		const source: QueueSource = {
			label: playlist.name, mode: s.mode, groupKey: s.groupKey,
		};
		void this.state.set({
			...source, entries,
		});
		if (online()) {
			void Socket.sendSoon({
				type: 'queue:set', source, entries: entries.map(toEntry),
			});
		}
	}

	public static stop(): void {
		if (this.state.get()) void this.state.set(undefined);
		if (online()) {
			void Socket.sendSoon({
				type: 'queue:set', source: { label: '' }, entries: [],
			});
		}
	}

	/** What plays next: the head of the queue, always. */
	public static next(): LightBeatmap | undefined {
		return this.state.get()?.entries[0]?.beatmap;
	}

	/**
	 * A guest's play just started: move it to the back, so the queue cycles, or
	 * out when played once. The server does this itself for a signed-in character.
	 *
	 * `played` names it rather than assuming it is still the head: starting takes
	 * a round trip or a whole simulation, and editing the queue meanwhile is the
	 * point of the feature. One that has been removed in that window rotates
	 * nothing - the queue is already what the player wants.
	 */
	public static advance(played: LightBeatmap): void {
		const s = this.state.get();
		if (!s || online()) return;
		const at = s.entries.findIndex(e => e.beatmap.is(played));
		if (at < 0) return;
		void this.state.set({
			...s, entries: advanceQueue(s.entries, at, once(s.mode)),
		});
	}

	/** Add to the back. Starts a queue if there is none, so adding one map from
	 *  an idle client is enough to have something to play. */
	public static append(beatmap: LightBeatmap, label = ''): void {
		const s = this.state.get();
		const queued = { beatmap };
		this.edit([...s?.entries ?? [], queued], {
			op: 'append', entry: toEntry(queued), label,
		}, label);
	}

	/** Put a map at the head, where it plays next. */
	public static playNext(beatmap: LightBeatmap, label = ''): void {
		const entries = this.state.get()?.entries ?? [];
		// by difficulty, not by instance: the library hands out fresh objects
		// whenever it reloads, and two of them are the same map. One already
		// queued moves up; its other copies keep their places.
		const at = entries.findIndex(e => e.beatmap.is(beatmap));
		const queued = entries[at] ?? { beatmap };
		this.edit([queued, ...entries.filter((_, i) => i !== at)], {
			op: 'playNext', entry: toEntry(queued), label,
		}, label);
	}

	public static remove(at: number): void {
		const s = this.state.get();
		if (!s?.entries[at]) return;
		this.edit(s.entries.filter((_, i) => i !== at), {
			op: 'remove', entry: refAt(s.entries, at),
		});
	}

	/** A copy right after it, to move where it should play again. */
	public static duplicate(at: number): void {
		const s = this.state.get();
		const entry = s?.entries[at];
		if (!s || !entry) return;
		const copy = {
			beatmap: entry.beatmap, repeat: entry.repeat,
		};
		this.edit(s.entries.toSpliced(at + 1, 0, copy), {
			op: 'duplicate', entry: refAt(s.entries, at),
		});
	}

	/** Play it `repeat` times in a row before the queue moves on. */
	public static setRepeat(at: number, repeat: number): void {
		const s = this.state.get();
		const entry = s?.entries[at];
		if (!s || !entry) return;
		this.edit(s.entries.with(at, withRepeat(entry, repeat)), {
			op: 'repeat', entry: refAt(s.entries, at), repeat,
		});
	}

	/** Reorder. Moving something to 0 is how "play this next" is expressed. */
	public static move(from: number, to: number): void {
		const s = this.state.get();
		if (!s || from === to) return;
		const entries = [...s.entries];
		const [moved] = entries.splice(from, 1);
		if (!moved) return;
		const at = Math.max(0, Math.min(entries.length, to));
		const before = entries[at];
		entries.splice(at, 0, moved);
		this.edit(entries, {
			op: 'move',
			entry: refAt(s.entries, from),
			before: before && refAt(s.entries, s.entries.indexOf(before)),
		});
	}

	/** Empty the queue. The running play is not touched - it finishes, and then
	 *  there is nothing behind it. */
	public static clear(): void {
		if (!this.state.get()) return;
		this.edit([], { op: 'clear' });
	}

	/** Show the edit now; signed in, the server's push confirms it. */
	private static edit(entries: Queued[], edit: QueueEdit, label = ''): void {
		const s = this.state.get();
		void this.state.set({
			// the server plays ranked maps this device never downloaded
			...(s ?? { label }), entries: online() ? entries : playable(entries),
		});
		if (online()) {
			void Socket.sendSoon({
				type: 'queue:edit', edit,
			});
		}
	}
}

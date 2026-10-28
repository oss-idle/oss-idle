import './SongSelect.css';

import { ph } from '@lingui/core/macro';
import {
	Plural,
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { Grades } from '@oss-idle/shared/grade';
import Log from '@oss-idle/shared/helpers/log';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { music } from '../audio/MusicPlayer';
import BeatmapCarousel, {
	type CarouselItem,
	type CarouselRow,
	type DownloadState,
} from '../components/BeatmapCarousel';
import IdleLogo from '../components/IdleLogo';
import { modSelectOpen } from '../components/mods/modSelectOpen';
import CardOverlays from '../components/songselect/CardOverlays';
import { playFromList } from '../components/songselect/listPlay';
import {
	queueSelection,
	SelectionContext,
} from '../components/songselect/selection';
import SongSelectBackdrop from '../components/songselect/SongSelectBackdrop';
import SongSelectDebug from '../components/songselect/SongSelectDebug';
import SongSelectFooter from '../components/songselect/SongSelectFooter';
import TopBar from '../components/songselect/TopBar';
import useQueueMode from '../components/songselect/useQueueMode';
import UserCard from '../components/songselect/UserCard';
import useSongSelectAudio from '../components/songselect/useSongSelectAudio';
import Character from '../db/schema/character';
import {
	getPlaylistIndex,
	playlistsVersion,
} from '../db/schema/playlist';
import {
	Score,
	scoresVersion,
} from '../db/schema/score';
import { xpGainsVersion } from '../db/schema/score_xp';
import {
	type GroupOption,
	SETTINGS,
	type SortOption,
} from '../db/settings';
import Entities from '../entity/entities';
import PlayQueue, { fillQueue } from '../gameplay/playQueue';
import {
	canPlayAt,
	liveSpeedUpgrades,
	selectedRate,
} from '../gameplay/playRate';
import {
	rateStars,
	starsOf,
} from '../gameplay/rateStars';
import {
	debugMode,
	openPage,
} from '../globals';
import Controls from '../input/Controls';
import useKeyboardOwner from '../input/keyboardOwner';
import Multiplayer from '../online/multiplayer';
import {
	getCharacter,
	getCharacterStats,
} from '../online/services/characters';
import BeatmapAPI, {
	isListed,
	Metadata,
} from '../osu/beatmap/beatmap_api';
import BeatmapStore, { beatmapsVersion } from '../osu/beatmap/beatmap_store';
import { matchesSearch } from '../osu/beatmap/beatmapSearch';
import {
	bestRankOf,
	EMPTY_HISTORY,
	EMPTY_PLAYLISTS,
	type Group,
	groupsOf,
	itemStatus,
	type PlaylistsByBeatmap,
	rankKey,
} from '../osu/beatmap/grouping';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import LightBeatmapSet from '../osu/beatmap/LightBeatmapSet';
import { selectedRuleset } from '../rulesets/registry';
import {
	UNLOCKS,
	XP_INSIGHT_TIER,
} from '../unlocks';
import { getXPInsights } from '../xpInsights';
import { launchPlay } from './launchPlay';
import SceneManager, { SCENE } from './SceneManager';
import { STRAIN_DEBUG_KEY } from './strainDebugKey';


/** The group a play was launched from, kept across the gameplay scene so that
 *  returning to song select reopens that group - not just the first group the
 *  played map happens to belong to. Consumed once by the next mount. */
let lastLaunchedGroupKey: string | null = null;

const getHistory = async (character: Character) => {
	const scores = await Score.query(
		'SELECT * FROM score WHERE characterId = ?'
		, [character.id]);
	// the grade of the top score at each rate, as the map card shows it
	const best = new Map<string, Score>();
	const lastPlayed = new Map<number, number>();
	for (const s of scores) {
		const key = rankKey(s.beatmapId, s.rate);
		const top = best.get(key);
		if (!top || s.isHigherThan(top)) best.set(key, s);
		lastPlayed.set(
			s.beatmapId, 
			Math.max(lastPlayed.get(s.beatmapId) ?? 0,
				s.playedAt,
			));
	}
	const bestRank = new Map([...best].map(([key, s]) => [key, Grades.indexOf(s.grade)]));
	return {
		bestRank, lastPlayed, 
	};
};
type History = Awaited<ReturnType<typeof getHistory>>;

const SORT_COMPARATORS: Record<SortOption, (
	a: CarouselItem, 
	b: CarouselItem, 
	h: History
) => number> = {
	'By Artist': (a, b) => 
		a.set.metadata.artist.localeCompare(b.set.metadata.artist),
	'By BPM': (a, b) => 
		a.beatmap.metadata.bpm - b.beatmap.metadata.bpm,
	'By Creator': (a, b) => 
		a.set.metadata.creator.localeCompare(b.set.metadata.creator),
	'By Difficulty': (a, b) => starsOf(a.beatmap) - starsOf(b.beatmap),
	'By Length': (a, b) => 
		a.beatmap.metadata.total_length - b.beatmap.metadata.total_length,
	'By Title': (a, b) => 
		a.set.metadata.title.localeCompare(b.set.metadata.title),
	'By Rank Achieved': (a, b, h) => 
		(bestRankOf(h, b.beatmap) ?? Infinity) 
		- (bestRankOf(h, a.beatmap) ?? Infinity),
	'Recently Played': (a, b, h) => 
		(h.lastPlayed.get(b.beatmap.metadata.id) ?? 0) 
		- (h.lastPlayed.get(a.beatmap.metadata.id) ?? 0),
};

function reconcileDownloads(
	prev: Record<number, DownloadState>,
	stored: Set<number>,
): Record<number, DownloadState> {
	const next = { ...prev };
	for (const id of stored) {
		if (next[id]?.status !== 'done') next[id] = {
			status: 'done', progress: 1, 
		};
	}
	for (const key of Object.keys(next)) {
		const id = Number(key);
		if (next[id].status === 'done' && !stored.has(id)) delete next[id];
	}
	return next;
}

type CarouselRows = { 
	rows: CarouselRow[]; 
	orderedItems: CarouselItem[]; 
	expanded: { group: Group; items: CarouselItem[] } | undefined 
};

function buildCarouselRows(
	filteredItems: CarouselItem[], group: GroupOption, history: History | undefined,
	expandedKey: string | null, playlistsByBeatmap: PlaylistsByBeatmap,
	downloaded: ReadonlySet<number> | undefined,
): CarouselRows {
	if (group === 'No Grouping') {
		return {
			rows: filteredItems.map((item): CarouselRow => ({
				type: 'card', item, 
			})),
			orderedItems: filteredItems,
			expanded: undefined,
		};
	}
	const hist = history ?? EMPTY_HISTORY;
	const now = Date.now();
	const buckets = new Map<string, { group: Group; items: CarouselItem[] }>();
	for (const item of filteredItems) {
		for (const g of groupsOf(
			item, 
			group, 
			hist, 
			now, 
			playlistsByBeatmap, 
			downloaded,
		)) {
			let bucket = buckets.get(g.key);
			if (!bucket) buckets.set(g.key, bucket = {
				group: g, items: [], 
			});
			bucket.items.push(g.entry ? {
				...item, beatmap: item.beatmap.at(g.rate, g.mods), entry: g.entry,
			} : item);
		}
	}
	// a playlist lists (and plays) in its own order
	if (group === 'By Playlist') {
		for (const b of buckets.values()) {
			b.items.sort((x, y) => (x.entry?.position ?? 0) - (y.entry?.position ?? 0));
		}
	}
	const ordered = [...buckets.values()].sort(
		(a, b) => 
			a.group.order - b.group.order || a.group.label.localeCompare(b.group.label),
	);
	const rows: CarouselRow[] = [];
	const orderedItems: CarouselItem[] = [];
	for (const { group: g, items: its } of ordered) {
		const open = expandedKey === g.key;
		rows.push({ 
			type: 'header', 
			key: g.key,
			label: g.label, 
			count: its.length, 
			collapsed: !open, 
		});
		for (const item of its) {
			orderedItems.push(item);
			if (open) rows.push({
				type: 'card', item, 
			});
		}
	}
	return { 
		rows, 
		orderedItems, 
		expanded: expandedKey ? buckets.get(expandedKey) : undefined,
	};
}

/**
 * Song select, in one of three modes.
 *
 * `launch` is the scene: clicking a downloaded map plays it. `queue` is the same
 * carousel mounted as an overlay above whatever is running, where clicking adds
 * to the queue instead - the whole point being that you can rebuild what plays
 * next without stopping what is playing. `edit` opens the clicked map in the
 * editor. Search, grouping, sorting, downloads and the card menu are the same in all.
 */
export type SongSelectMode = 'launch' | 'queue' | 'edit';
type Props = { mode?: SongSelectMode };

export default function SongSelect({ mode = 'launch' }: Props) {
	const { overlay, queueing } = useQueueMode(mode);
	// queueing asks a different question - which map to add, not which is playing -
	// so it browses against its own selection and leaves the live one alone
	const selection = queueing ? queueSelection : music.beatmap;
	const previews = useSongSelectAudio(overlay, selection);

	// the right-click contextual menu's target, and the playlist manager's target
	const [menuItem, setMenuItem] = useState<CarouselItem | null>(null);
	const [playlistItem, setPlaylistItem] = useState<CarouselItem | null>(null);
	const onBack = (clearSearch: boolean) => {
		if (modSelectOpen.get()) { void modSelectOpen.set(false); return; }
		if (playlistItem) { setPlaylistItem(null); return; }
		if (menuItem) { setMenuItem(null); return; }
		// Escape never reaches here while a page is open: Controls closes the page
		// itself and stops there (see its `escape` case), so queueing is left
		// without the scene under it also acting on the same keypress.
		if (openPage.get()) { void openPage.set(undefined); return; }
		if (clearSearch && SETTINGS.search.get()) { SETTINGS.search.set(''); return; }
		SETTINGS.search.set('');
		if (Multiplayer.picking.get()) Multiplayer.picked();
		else SceneManager.set(SCENE.MENU);
	};

	Controls.back.usePress(() => onBack(true));

	const [scrollSpeed] = useSynced(SETTINGS.scrollspeed);
	const [library] = useSynced(beatmapsVersion);
	const [character] = useSynced(Entities.character);
	const [ruleset] = useSynced(selectedRuleset);
	const online_character = useAsync(async () => character.isGuest() ? undefined
		: getCharacter(character.id, ruleset)
	, [character, ruleset]);
	const online_stats = useAsync(async () => character.isGuest() ? undefined
		: getCharacterStats(character.id, ruleset)
	, [character, ruleset]);
	const [debug] = useSynced(debugMode);
	const { t } = useLingui(); // for strings outside JSX text (attrs, toasts, menu)

	const [items, setItems] = useState<CarouselItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [version] = useSynced(selection);
	const [downloads, setDownloads] = useState<Record<number, DownloadState>>({});
	const [debugBeatmap, setDebugBeatmap] = useState<LightBeatmap>();
	const [search] = useSynced(SETTINGS.search);
	const searchRef = useRef<HTMLInputElement>(null);
	const scrubRef = useRef<HTMLDivElement>(null);
	const [scoreView, setScoreView] = useState(false);

	/** (Re)load the whole library from the manifest, returning the sorted items. */
	const loadLibrary = useCallback(async (): Promise<CarouselItem[]> => {
		try {
			const manifest = await BeatmapAPI.getManifest();
			const runtime = await BeatmapStore.getAllSets();
			const remoteMaps = manifest.beatmaps
				.filter(isListed)
				.flatMap(m => LightBeatmapSet
					.fromMetadata(m)
					.getCarouselItems(),
				);
			const localMaps = runtime.flatMap(r => r.getCarouselItems());
			const sets = new Map<number, CarouselItem>();
			remoteMaps.forEach(m => sets.set(m.beatmap.metadata.id, m));
			localMaps.forEach(m => sets.set(m.beatmap.metadata.id, m));
			const tags = new Map(manifest.beatmaps
				.flatMap(m => m.versions)
				.map(v => [v.id, v.tags]));
			const loved = new Set(manifest.beatmaps
				.filter(m => m.loved)
				.flatMap(m => m.versions.map(v => v.id)));
			const bundled = new Set(manifest.beatmaps
				.filter(m => m.bundled)
				.flatMap(m => m.versions.map(v => v.id)));
			const all = Array.from(sets
				.values())
				.map(item => ({
					...item,
					tags: tags.get(item.beatmap.metadata.id),
					ranked: tags.has(item.beatmap.metadata.id),
					loved: loved.has(item.beatmap.metadata.id),
					bundled: bundled.has(item.beatmap.metadata.id),
				}))
				.sort((a, b) =>
					a.beatmap.metadata.difficulty - b.beatmap.metadata.difficulty,
				);
			setItems(all);
			// reconcile downloaded status (drives card styling) against what's actually
			// stored (see reconcileDownloads); a set missing a listed difficulty can be
			// downloaded again
			const partial = new Set(all
				.filter(i => !i.beatmap.metadata.runtime)
				.map(i => i.set.metadata.id));
			const stored = new Set(all
				.filter(i => i.beatmap.metadata.runtime && !partial.has(i.set.metadata.id))
				.map(i => i.set.metadata.id));
			setDownloads((d) => reconcileDownloads(d, stored));
			return all;
		} catch (e) {
			setError(String(e));
			return [];
		} finally {
			setLoading(false);
		}
	}, []);

	// `library` bumps when the stored set changes (e.g. a wipe from Options), so
	// the carousel reflects deletions without a full reload.
	const [showUndownloaded] = useSynced(SETTINGS.showUndownloaded);
	const [showUnbundled] = useSynced(SETTINGS.showUnbundled);
	useEffect(() => {
		void loadLibrary();
	}, [loadLibrary, library, showUndownloaded, showUnbundled, ruleset]);

	useKeyboardOwner(searchRef, { active: !debugBeatmap });

	const [sort] = useSynced(SETTINGS.sortby);
	const [group] = useSynced(SETTINGS.groupby);

	// local playlists, re-read on every mutation: which playlists each difficulty
	// belongs to drives the "By Playlist" group mode.
	const [plVersion] = useSynced(playlistsVersion);
	const playlistIndex = useAsync(() => getPlaylistIndex(), [plVersion]);
	const playlistsByBeatmap = playlistIndex?.byBeatmap ?? EMPTY_PLAYLISTS;

	const comparator = SORT_COMPARATORS[sort];

	// per-beatmap play history for the active character, backing the two
	// history-based sorts. A score's `beatmapId` matches `beatmap.metadata.id`
	// (the same key the leaderboard queries by).
	const [scoresV] = useSynced(scoresVersion);
	const history = useAsync(() => getHistory(character), [character, scoresV]);

	// per-beatmap XP gain indicators, bulk-loaded so future group/sort modes can
	// read the same map. Gated by the feature's unlock tier.
	const [xpTier] = useSynced(UNLOCKS.xpInsight);
	const [xpVersion] = useSynced(xpGainsVersion);
	const xpInsights = useAsync(
		async () => xpTier === XP_INSIGHT_TIER.LOCKED
			? undefined
			: getXPInsights(character.id),
		[character, xpTier, xpVersion],
	);

	// the carousel shows the search-filtered, sort-ordered subset; selection logic
	// keeps using the full `items` so a search never loses the current selection
	// at a rate, stars change: the sort, the star groups and a star search follow
	const [ratedStars] = useSynced(rateStars);
	// grades are per rate: the rank sort and groups follow the picked one
	const [pickedRate] = useSynced(selectedRate);
	const filteredItems = useMemo(() => {
		if (!history) return [];
		const filtered = search.trim() ? 
			items.filter(item => matchesSearch(item.beatmap, item.set, search, item.tags, itemStatus(item))) 
			: items;
		return comparator ? 
			[...filtered].sort((a, b) => comparator(a, b, history)) 
			: filtered;
	}, [items, search, history, comparator, ratedStars, pickedRate]);

	// accordion: at most one group open at a time (null = all collapsed). A fresh
	// group mode resets it; the active group then re-opens via the effect below.
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	useEffect(() => { setExpandedKey(null); }, [group]);

	// the group a play was launched from (set when leaving for gameplay), captured
	// once for this mount so returning here reopens it; cleared so a later mount
	// only restores after a fresh play.
	const restoreGroupKey = useRef(lastLaunchedGroupKey);
	useEffect(() => { lastLaunchedGroupKey = null; }, []);

	// frozen downloaded set for the "By Download Status" group mode: captured once
	// per entry into the mode so a map downloaded mid-session stays under "Available"
	// rather than jumping to "Downloaded" and dragging the selection with it. Cleared
	// when leaving the mode; captured from the freshest items once they're loaded
	const [downloadSnapshot, setDownloadSnapshot] = useState<ReadonlySet<number>>();
	useEffect(() => {
		if (group !== 'By Download Status') { setDownloadSnapshot(undefined); return; }
		if (downloadSnapshot || !items.length) return;
		setDownloadSnapshot(new Set(items
			.filter((i) => i.beatmap.metadata.runtime)
			.map((i) => i.beatmap.metadata.id),
		));
	}, [group, items, downloadSnapshot]);

	// opening a group closes the previously open one clicking the open one collapses it
	const toggleGroup = useCallback((key: string) => {
		setExpandedKey((prev) => (prev === key ? null : key));
	}, []);

	// the group(s) holding the current selection - plural, because a difficulty
	// can sit in several playlists at once. Joined into one string so the effect
	// below re-runs only on a genuine membership change, not on every recompute.
	const activeGroupKeys = useMemo(() => {
		if (group === 'No Grouping' || !version) return '';
		const item = items.find((i) => i.beatmap.is(version.metadata.id));
		if (!item) return '';
		return groupsOf(
			item, 
			group, 
			history ?? EMPTY_HISTORY, 
			Date.now(), 
			playlistsByBeatmap, 
			downloadSnapshot,
		)
			.map((g) => g.key).join('\n');
	}, [group, version, items, history, playlistsByBeatmap, downloadSnapshot, ratedStars, pickedRate]);

	// the selection's group opens automatically when the selection moves into it
	// (closing any other) - but stays collapsible by hand, since we only re-open on
	// a genuine change of active groups, not on every render. When the selection
	// sits in several groups, one already open wins; otherwise the first opens.
	useEffect(() => {
		const keys = activeGroupKeys ? activeGroupKeys.split('\n') : [];
		if (keys.length === 0) return;
		setExpandedKey((prev) => {
			if (prev && keys.includes(prev)) return prev;
			// the running queue's group wins over another playlist holding the same map
			const restore = PlayQueue.state.get()?.groupKey ?? restoreGroupKey.current;
			if (restore && keys.includes(restore)) return restore;
			return keys[0];
		});
	}, [activeGroupKeys]);

	// grouped carousel rows folded from the sorted, filtered list
	const { rows, orderedItems, expanded } = useMemo(
		() => buildCarouselRows(
			filteredItems, 
			group, 
			history, 
			expandedKey,
			playlistsByBeatmap, 
			downloadSnapshot,
		),
		[filteredItems, group, history, expandedKey, playlistsByBeatmap, downloadSnapshot, pickedRate],
	);

	/**
	 * Select a difficulty: record the global selection (the carousel reacts by
	 * gliding the card to centre) and start its audio - the full song if the set
	 * is downloaded (a parsed Beatmap), otherwise the manifest preview clip (a
	 * VersionMetadata). The MusicPlayer resolves the right source from whichever
	 * it's handed; the backdrop is swapped per-difficulty too.
	 */
	const selectItem = useCallback(async (beatmap: LightBeatmap) => {
		if (beatmap.is(selection.get())) return;

		console.log('selected', beatmap.metadata.version);
		await selection.set(beatmap);
	}, [selection]);

	// Previewing follows the selection rather than the click that caused it, so
	// the dock putting the list on the map being played sounds like picking it.
	useEffect(() => {
		if (!previews || !version) return;
		void music.play(version.metadata.runtime ? version.metadata.previewTime : 0);
	}, [version, previews]);

	// a playlist entry locked at a rate out of the character's reach is skipped
	const [speedUpgrades] = useSynced(liveSpeedUpgrades);
	const selectableItems = useMemo(
		() => orderedItems.filter((i) => canPlayAt(i.beatmap.lockedRate)),
		[orderedItems, speedUpgrades],
	);

	const move = useCallback((step: number) => {
		const current = selectableItems
			.findIndex((i) => i.beatmap.is(selection.get()));
		// when nothing is selected, next lands on the first card, previous the last
		const next = current === -1
			? (step === 1 ? 0 : selectableItems.length - 1)
			: Math.min(Math.max(current + step, 0), selectableItems.length - 1);
		const item = selectableItems[next];
		if (item) void selectItem(item.beatmap);
	}, [selectableItems, selectItem]);

	// osu!'s F2: a random map of the list, never the one already selected
	const random = useCallback(() => {
		const others = selectableItems.filter(i => !i.beatmap.is(selection.get()));
		const pick = others[Math.floor(Math.random() * others.length)];
		if (pick) void selectItem(pick.beatmap);
	}, [selectableItems, selectItem, selection]);

	// entered with the intro still playing: move on to a map of the list
	useEffect(() => {
		if (selection.get()?.inPickedRuleset() === false) random();
	}, [random]);

	// osu!'s F3: the selected card's menu
	const beatmapOptions = useCallback(() => {
		const item = orderedItems.find(i => i.beatmap.is(selection.get()));
		if (item) setMenuItem(item);
	}, [orderedItems, selection]);

	Controls.next.usePress(() => { if (!openPage.get()) move(1); });
	Controls.previous.usePress(() => { if (!openPage.get()) move(-1); });
	Controls.confirm.usePress(() => {
		if (openPage.get()) { return; }
		if (playlistItem) { return; }
		if (menuItem) { return; }
		const map = selection.get();
		if (!map) return;
		if (!handleCardClick(map, false)) {
			handleCardDoubleClick(map);
		}
	});

	/**
	 * Launch gameplay for a downloaded difficulty (see {@link launchPlay}) and
	 * fill the queue per the selected mode ({@link fillQueue}; debug launches
	 * never chain).
	 */
	const play = useCallback((beatmap: LightBeatmap, debug = false, arm = true) => {
		const groupKey = expanded?.group.key;
		lastLaunchedGroupKey = groupKey ?? null;
		if (!debug && arm) {
			fillQueue(beatmap, {
				mode: SETTINGS.autopilotMode.get(),
				groupKey,
				label: expanded?.group.label ?? '',
				playlists: group === 'By Playlist',
				pool: (expanded ? expanded.items : orderedItems).map((i) => ({
					beatmap: i.beatmap, repeat: i.entry?.repeat,
				})),
			});
		}
		launchPlay(beatmap, debug);
	}, [group, expanded, orderedItems]);

	// the dock plays through this so the queue fills from the listing on screen,
	// rather than launching a lone play the way spectating does
	useEffect(() => {
		void playFromList.set((map: LightBeatmap) => {
			const item = orderedItems.find((i) => i.beatmap.is(map));
			if (!item?.beatmap.metadata.runtime) return false;
			void selectItem(item.beatmap);
			// a queue the player arranged is theirs: only fill it from the listing
			// when there is nothing in it to lose
			play(item.beatmap, false, !PlayQueue.state.get()?.entries.length);
			return true;
		});
		return () => { void playFromList.set(undefined); };
	}, [orderedItems, play, selectItem]);

	/** Download a remote set, then upgrade it in place to playable RuntimeBeatmaps. */
	const download = useCallback(async (meta: Metadata) => {
		console.log('Clicked on download', meta.title);
		const status = downloads[meta.id]?.status;
		if (status === 'downloading' || status === 'done') return;
		setDownloads((d) => ({
			...d, [meta.id]: { 
				status: 'downloading',
				progress: 0, 
			}, 
		}));
		try {
			await BeatmapAPI.downloadOsz(meta, (progress) =>
				setDownloads((d) => ({
					...d, [meta.id]: {
						status: 'downloading', progress, 
					}, 
				})),
			);
			setDownloads((d) => ({
				...d, [meta.id]: {
					status: 'done', progress: 1, 
				}, 
			}));
			
			const all = await loadLibrary();
			const item = all.find((i) => i.beatmap.is(selection.get()));
			if (item) void selectItem(item.beatmap);
		} catch (e) {
			console.error('[download] failed', e);
			setDownloads((d) => ({
				...d, [meta.id]: {
					status: 'idle', progress: 0, 
				}, 
			}));
		}
	}, [downloads, loadLibrary, selectItem]);

	const handleCardClick = useCallback((
		beatmap: LightBeatmap, 
		pointer: boolean = true,
	) => {
		if (scoreView) return false;
		if (!canPlayAt(beatmap.lockedRate)) return true;
		console.log('Clicked on card', beatmap.metadata.version);
		if (beatmap.metadata.runtime && beatmap.is(selection.get())) {
			if (queueing) PlayQueue.append(beatmap, queueLabel);
			else if (mode === 'edit') SceneManager.set(SCENE.EDITOR, beatmap);
			else if (Multiplayer.picking.get()) Multiplayer.picked(beatmap.metadata.id);
			else play(beatmap);
			return true;
		}

		if (pointer) {
			void selectItem(beatmap);
		}
		return false;
	}, [scoreView, play, selectItem, queueing, mode, expanded, selection]);

	// double click: download the set - but do nothing if it's already downloaded
	const handleCardDoubleClick = useCallback((beatmap: LightBeatmap) => {
		if (scoreView) return;
		const set = beatmap.set;
		if (beatmap.metadata.runtime || set.metadata.runtime) return;
		void download(set.metadata);
	}, [scoreView, download]);

	// right click (no drag): the card's osu!-style contextual menu
	const handleCardRightClick = useCallback((item: CarouselItem) => {
		if (scoreView) return;
		setMenuItem(item);
	}, [scoreView]);

	// delete the menu target's whole set, or only its difficulty, from the local
	// store; the version bump reloads the carousel without the deleted cards.
	const deleteSet = useCallback((item: CarouselItem) => {
		setMenuItem(null);
		BeatmapStore.deleteSet(item.set.metadata.id)
			.then(() => Log.popup(t`Beatmap deleted`))
			.catch((e) => Log.errorPopup(String(e)));
	}, [t]);

	const deleteDifficulty = useCallback((item: CarouselItem) => {
		setMenuItem(null);
		BeatmapStore.deleteVersion(item.set.metadata.id, item.beatmap.metadata.id)
			.then(() => Log.popup(t`Difficulty deleted`))
			.catch((e) => Log.errorPopup(String(e)));
	}, [t]);

	const clearScores = useCallback((item: CarouselItem) => {
		setMenuItem(null);
		Score.clearBeatmap(item.beatmap.metadata.id)
			.then(() => Log.popup(t`Local scores cleared`))
			.catch((e) => Log.errorPopup(String(e)));
	}, [t]);

	const openDebug = useCallback((beatmap: LightBeatmap) => {
		sessionStorage.setItem(STRAIN_DEBUG_KEY, String(beatmap.metadata.id));
		setDebugBeatmap(beatmap);
	}, []);

	const closeDebug = useCallback(() => {
		sessionStorage.removeItem(STRAIN_DEBUG_KEY);
		setDebugBeatmap(undefined);
	}, []);

	// dev-only: open the strain debug overlay for the selected, downloaded diff
	const handleDebug = useCallback(() => {
		const item = version && items.find((i) => i.beatmap.is(version.metadata.id));
		if (!item) return;
		if (!item.beatmap.metadata.runtime) {
			Log.popup(t`Download the beatmap first`);
			return;
		}
		openDebug(item.beatmap);
	}, [version, items, openDebug, t]);

	// reopen the strain debug after a full dev-server reload (skill edits force
	// one, which wipes in-memory scene state)
	useEffect(() => {
		if (debugBeatmap || !items.length) return;
		const stored = sessionStorage.getItem(STRAIN_DEBUG_KEY);
		if (!stored) return;
		const item = items.find((i) => i.beatmap.is(Number(stored)));
		if (item?.beatmap.metadata.runtime) setDebugBeatmap(item.beatmap);
	}, [items, debugBeatmap]);

	// where a queued map came from, for the queue's own label
	const queueLabel = expanded?.group.label ?? '';

	const total = items.length; // named in the results <Trans> below

	return (
		<SelectionContext.Provider value={selection}>
			<div className={[
				'game',
				scoreView ? 'score-view' : '',
				queueing ? 'game--queueing' : '',
				overlay ? 'game--queue' : '',
			].join(' ')}>
				{/* mounted over another scene it draws no scenery, so what is behind
				    stays visible; queueing swaps the metadata and the leaderboard for
				    the grouping controls, which are how you find what to queue */}
				{!overlay && <SongSelectBackdrop />}
				{/* the right button scrubs the carousel from the whole body, the
				    leaderboard included; the card overlays stay outside */}
				<div ref={scrubRef} className="game__scrub">
					<TopBar
						version={version}
						scrollSpeed={scrollSpeed}
						scoreView={scoreView}
						setScoreView={setScoreView}
						compact={queueing}
					/>

					<main className="game__body">

						{error ? (
							<div className="game__library-error">
								<Trans>Couldn't load beatmaps: {error}</Trans>
							</div>
						) : (
							<BeatmapCarousel
								rows={rows}
								onCardClick={handleCardClick}
								onCardDoubleClick={handleCardDoubleClick}
								onCardRightClick={handleCardRightClick}
								onToggleGroup={toggleGroup}
								loading={loading}
								downloads={downloads}
								xpInsights={xpInsights}
								totalCount={filteredItems.length}
								scrubArea={scrubRef}
							/>
						)}

						<div className="songsearch">
							<div className="songsearch__row">
								<span><Trans>Search:</Trans> </span>
								<input
									ref={searchRef}
									className="songsearch__input"
									value={search}
									onChange={(e) => SETTINGS.search.set(e.target.value)}
									onKeyDown={(e) => { if (e.key === 'Tab') e.preventDefault(); }}
									placeholder={t`Type to search!`}
									spellCheck={false}
									autoComplete="off"
								/>
							</div>
							<div className="songsearch__count">
								{search.trim()
									? <Trans>{ph({ shown: filteredItems.length })} of {total} results</Trans>
									: <Plural value={ph({ results: items.length })} one="# result" other="# results" />}
							</div>
						</div>
					</main>
				</div>

				{!overlay && (
					<div className="game__botbar">
						<div className="game__botbar-left">
							<button className="game__exit" onClick={() => onBack(false)}>
								<Trans>BACK</Trans>
							</button>
							<SongSelectFooter onRandom={random} onOptions={beatmapOptions} />
						</div>
						<UserCard
							character={character}
							online_character={online_character}
							online_stats={online_stats}
						/>
						<div className="game__logo">
							<IdleLogo size="100%" onClick={() => version && handleCardClick(version, false)} />
						</div>
					</div>
				)}

				<SongSelectDebug
					enabled={debug}
					onOpen={handleDebug}
					beatmap={debugBeatmap}
					onClose={closeDebug}
					onPlay={(map) => play(map, true)}
				/>

				<CardOverlays
					menuItem={menuItem}
					playlistItem={playlistItem}
					queueLabel={queueLabel}
					onCloseMenu={() => setMenuItem(null)}
					onManagePlaylists={() => { setPlaylistItem(menuItem); setMenuItem(null); }}
					onClosePlaylists={() => setPlaylistItem(null)}
					onDeleteSet={() => menuItem && deleteSet(menuItem)}
					onDeleteDifficulty={() => menuItem && deleteDifficulty(menuItem)}
					onClearScores={() => menuItem && clearScores(menuItem)}
				/>
			</div>
		</SelectionContext.Provider>
	);
}
import {
	ph,
	plural,
	t,
} from '@lingui/core/macro';

import { Grades } from '@oss-idle/shared/grade';

import { CarouselItem } from '../../components/BeatmapCarousel';
import type { PlaylistMembership } from '../../db/schema/playlist';
import { selectedRate } from '../../gameplay/playRate';
import { starsOf } from '../../gameplay/rateStars';
import type LightBeatmap from './LightBeatmap';

/** Per-character play history, keyed by beatmap (difficulty) id. Mirrors what
 *  SongSelect derives from the local score table; the two history-based group
 *  modes (rank / recency) read from it. */
export interface PlayHistory {
	bestRank: Map<string, number>;   // rankKey -> Grades index of the top score at that rate
	lastPlayed: Map<number, number>; // beatmapId -> most recent playedAt (ms epoch)
}

export const rankKey = (beatmapId: number, rate: number): string =>
	`${beatmapId}@${rate.toFixed(2)}`;

/** Best Grades index at the difficulty's locked rate, else the picked one. */
export const bestRankOf = (history: PlayHistory, beatmap: LightBeatmap): number | undefined =>
	history.bestRank.get(rankKey(beatmap.metadata.id, beatmap.lockedRate ?? selectedRate.get()));

export const EMPTY_HISTORY: PlayHistory = { 
	bestRank: new Map(), 
	lastPlayed: new Map(), 
};

/** beatmapId -> the local playlists containing that difficulty, once per copy
 *  of it there. Backs the "By Playlist" group mode. */
export type PlaylistsByBeatmap = Map<number, PlaylistMembership[]>;

export const EMPTY_PLAYLISTS: PlaylistsByBeatmap = new Map();

/** A carousel group: `key` is its stable identity (collapse state, react key),
 *  `label` the header text, `order` its position among groups (ascending). */
export interface Group {
	key: string;
	label: string;
	order: number;
	/** By Playlist: the rate the difficulty is locked at in this playlist */
	rate?: number;
	/** By Playlist: the mods locked with that rate */
	mods?: PlaylistMembership['mods'];
	/** By Playlist: which copy of the difficulty this is */
	entry?: PlaylistMembership['entry'];
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const LAST = 1e9;

/** First-letter bucket: A–Z upper-cased, everything else under '#'. */
function letterGroup(value: string): Group {
	const c = value.trim().charAt(0).toUpperCase();
	const isLetter = c >= 'A' && c <= 'Z';
	return isLetter ? { 
		key: c, 
		label: c, 
		order: c.charCodeAt(0),
	} : { 
		key: '#', 
		label: '#', 
		order: LAST, 
	};
}

/** Length in per-minute bands, collapsing 5–10 min and 10 min+ into one each. */
function lengthGroup(ms: number): Group {
	const min = Math.floor(ms / MINUTE);
	if (min < 5) return { 
		key: `l${min}`, 
		label: t`${ph({ from: min })}-${ph({ to: min + 1 })} min`, 
		order: min,
	};
	if (min < 10) return {
		key: 'l5', label: t`${ph({ from: 5 })}-${ph({ to: 10 })} min`, order: 5, 
	};
	return {
		key: 'l10', label: t`${ph({ from: 10 })}+ min`, order: 10, 
	};
}

/** Named recency buckets: Today / Yesterday / Last week / N months ago (≈30-day
 *  months) up to "Over 5 months ago", and "Never" for maps with no play */
function recencyGroup(last: number | undefined, now: number): Group {
	if (!last) return {
		key: 'never', label: t`Never`, order: LAST, 
	};
	const days = Math.floor((now - last) / DAY);
	if (days <= 0) return {
		key: 'today', label: t`Today`, order: 0, 
	};
	if (days === 1) return {
		key: 'yesterday', label: t`Yesterday`, order: 1, 
	};
	if (days < 7) return {
		key: 'week', label: t`Last week`, order: 2, 
	};
	const months = Math.max(1, Math.floor(days / 30));
	if (months > 5) return {
		key: 'old', label: t`Over 5 months ago`, order: 99, 
	};
	return { 
		key: `m${months}`, 
		label: plural(months, {
			one: '# month ago', other: '# months ago', 
		}), 
		order: 2 + months, 
	};
}

const STATUSES = ['ranked', 'loved', 'unranked', 'local'] as const;
export type ItemStatus = (typeof STATUSES)[number];

/** Ranked or Loved (in the catalog), Unranked (a player's upload) or Local (an import
 *  or editor map: negative ids). */
export const itemStatus = (item: CarouselItem): ItemStatus => {
	if (item.ranked) return item.loved ? 'loved' : 'ranked';
	return item.set.metadata.id < 0 ? 'local' : 'unranked';
};

function statusGroup(item: CarouselItem): Group {
	const status = itemStatus(item);
	const labels: Record<ItemStatus, string> = {
		ranked: t`Ranked`, loved: t`Loved`, unranked: t`Unranked`, local: t`Local`,
	};
	return {
		key: status, label: labels[status], order: STATUSES.indexOf(status),
	};
}

/** Bundled, SV, LN: every one that applies, or Uncategorized. */
function tagGroups(item: CarouselItem): Group[] {
	const groups: Group[] = [];
	if (item.bundled) groups.push({
		key: 'bundled', label: t`Bundled`, order: 0,
	});
	if (item.tags?.includes('sv')) groups.push({
		key: 'sv', label: t`SV`, order: 1,
	});
	if (item.tags?.includes('ln')) groups.push({
		key: 'ln', label: t`LN`, order: 2,
	});
	return groups.length ? groups : [{
		key: 'uncategorized', label: t`Uncategorized`, order: LAST,
	}];
}

/**
 * Every group a carousel item falls into for the given group mode. Most modes
 * bucket an item exactly once, but "By Playlist" mirrors osu! collections: a
 * difficulty appears under *each* playlist holding it, once per locked rate,
 * and one in no playlist is hidden from the view entirely (empty result).
 * "By Tag" likewise lists a difficulty under each of its tags.
 */
export function groupsOf(
	item: CarouselItem, mode: string, history: PlayHistory, now: number,
	playlists: PlaylistsByBeatmap, downloaded?: ReadonlySet<number>,
): Group[] {
	if (mode === 'By Playlist') {
		// all order 0: playlists render alphabetically via the label tiebreak
		return (playlists.get(item.beatmap.metadata.id) ?? [])
			.map((p) => ({
				key: `p${p.id}`, label: p.name, order: 0, rate: p.rate, mods: p.mods, entry: p.entry,
			}));
	}
	if (mode === 'By Tag') return tagGroups(item);
	const g = groupOf(item, mode, history, now, downloaded);
	return g ? [g] : [];
}

/**
 * The group a carousel item falls into for the given group mode, or `null` for
 * "No Grouping". Groups are rendered in ascending `order`; items within a group
 * keep the active sort order.
 */
export function groupOf(
	item: CarouselItem, mode: string, history: PlayHistory, now: number, downloaded?: ReadonlySet<number>,
): Group | null {
	const bm = item.beatmap.metadata;
	const set = item.set.metadata;
	switch (mode) {
		case 'By Artist': return letterGroup(set.artist);
		case 'By Title': return letterGroup(set.title);
		case 'By Creator': return letterGroup(set.creator);
		case 'By Difficulty': {
			const n = Math.floor(starsOf(item.beatmap));
			return {
				key: `d${n}`, label: `${n} - ${n + 1}★`, order: n, 
			};
		}
		case 'By BPM': {
			const lo = Math.floor(bm.bpm / 10) * 10;
			return {
				key: `b${lo}`, label: `${lo} - ${lo + 10} BPM`, order: lo, 
			};
		}
		case 'By Length': return lengthGroup(bm.total_length);
		case 'By Download Status': {
			// `downloaded` is a frozen snapshot when present, so a map downloaded
			// mid-session keeps showing under "Available" instead of jumping groups
			// (which would drag the selection along). Live `runtime` before it's set.
			const has = downloaded ? downloaded.has(bm.id) : bm.runtime;
			return has
				? {
					key: 'downloaded', label: t`Downloaded`, order: 0, 
				}
				: {
					key: 'available', label: t`Available`, order: 1, 
				};
		}
		case 'By Status': return statusGroup(item);
		case 'By Rank Achieved': {
			const rank = bestRankOf(history, item.beatmap);
			if (rank === undefined) return {
				key: 'unplayed', 
				label: t`Unplayed`,
				order: LAST, 
			};
			return {
				key: Grades[rank], label: Grades[rank], order: rank, 
			};
		}
		case 'Recently Played': return recencyGroup(history.lastPlayed.get(bm.id), now);
		default: return null;
	}
}

/**
 * Beatmap nomination status, shared so the server schema + route validation and
 * the web nomination UI agree on one set of values.
 *
 * - `pending`  uploaded, not scheduled (no rankedAt yet)
 * - `ranked`   scheduled/live - live once rankedAt has passed
 * - `rejected` pulled from the queue
 * - `unranked` a player's own upload: public, and theirs to replace
 * - `loved`    like ranked (live once rankedAt has passed), but gives no pp
 */
export const BEATMAP_STATUS = ['pending', 'ranked', 'rejected', 'unranked', 'loved'] as const;
export type BeatmapStatus = (typeof BEATMAP_STATUS)[number];

/** Approved: ranked or loved. Their sets go live: played server-side, with leaderboards
 *  and ranked score. */
export const APPROVED_STATUSES = ['ranked', 'loved'] as const;
export type ApprovedStatus = (typeof APPROVED_STATUSES)[number];

export const isApproved = (status: BeatmapStatus): status is ApprovedStatus =>
	(APPROVED_STATUSES as readonly string[]).includes(status);

/** New maps a month, like osu!: a base, one more per set of theirs that is ranked
 *  now, and more for supporters. */
const MONTHLY_BASE = 3;
export const SUPPORTER_UPLOAD_BONUS = 2;

export const monthlyQuota = (rankedSets: number, supporter: boolean) =>
	MONTHLY_BASE + rankedSets + (supporter ? SUPPORTER_UPLOAD_BONUS : 0);

/** Tags set by hand on a difficulty, on top of what its .osu says. */
export const MAP_TAGS = ['sv', 'ln'] as const;
export type MapTag = (typeof MAP_TAGS)[number];

export const parseMapTags = (csv: string): MapTag[] =>
	MAP_TAGS.filter(tag => csv.split(',').includes(tag));

/**
 * The startup intro set (nekodex - circles!). It's a standard-mode map, not a
 * ranked mania beatmap, so it's the one set ingested regardless of mode and kept
 * out of the website's ranked listings - it's only used for the intro sequence.
 */
export const INTRO_SET_ID = 355322;

export type MapCover = {
	id: number;
	osuId: number | null;
	/** one of its difficulties' preview background */
	background?: string | null;
};

/** A difficulty as a set's panel lists it. */
export type PanelDiff = { id: number, version: string, sr: number, keys: number };

/** Our own preview of a set's background, when one of its difficulties has one. */
export const ownCoverUrl = (set: MapCover, apiBase = '') =>
	set.background ? `${apiBase}/v1/beatmap/preview/${set.id}/${set.background}` : undefined;

/** A set's cover: osu!'s when it is on osu!, else our own preview background. */
export const mapCoverUrl = (set: MapCover, size: 'list' | 'card' | 'cover', apiBase = '') => {
	if (set.osuId) return `https://assets.ppy.sh/beatmaps/${set.osuId}/covers/${size}.jpg`;
	return ownCoverUrl(set, apiBase);
};

/** Downloads a set into the game: the desktop app takes it from the OS, an
 *  open game tab or frame from {@link MAP_LINK_CHANNEL}. */
export const mapDownloadLink = (setId: number) => `oss-idle://dl/${setId}`;

/** Same-origin BroadcastChannel game tabs listen on for {@link mapDownloadLink}s;
 *  a game that takes one answers `true`. */
export const MAP_LINK_CHANNEL = 'oss-idle:links';

/** A set's page on osu!, when it is on osu!. */
export const osuSetUrl = (osuSetId: number | null | undefined) => osuSetId
	? `https://osu.ppy.sh/beatmapsets/${osuSetId}`
	: undefined;

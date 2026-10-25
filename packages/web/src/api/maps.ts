import {
	apiUrl,
	json,
	rpc,
	unwrap,
	withAuth,
} from './client';
import {
	MAP_LINK_CHANNEL,
	mapCoverUrl,
	mapDownloadLink,
	type BeatmapStatus,
	type MapCover,
	type MapTag,
} from '@oss-idle/shared/beatmap';

/** How long an open game has to answer before the desktop app is asked instead. */
const ANSWER_WAIT = 300;

/** Download a set into the game: an open game tab or the in-game browser's game takes
 *  it, otherwise its link opens the desktop app. */
export const sendToGame = (setId: number) => {
	const link = mapDownloadLink(setId);
	const channel = new BroadcastChannel(MAP_LINK_CHANNEL);
	const fallback = setTimeout(() => {
		channel.close();
		location.href = link;
	}, ANSWER_WAIT);
	channel.onmessage = () => {
		clearTimeout(fallback);
		channel.close();
	};
	channel.postMessage(link);
};

/** A set's cover as a CSS background-image: osu!'s, else our own preview. */
export const coverBackground = (set: MapCover, size: 'list' | 'card' | 'cover') => {
	const url = mapCoverUrl(set, size, apiUrl(''));
	return url && `url('${url}')`;
};

/** Public: live general stats (online/playing counts, totals). */
export const getRecentMaps = () =>
	unwrap(rpc.v1.beatmap.recent.$get());

/** Which maps the listing shows, and a name to look for in their title, artist or mapper. */
export type MapFilter = { status?: 'ranked' | 'unranked' | 'any', q?: string };

export const getAllMaps = (dir?: 'asc' | 'desc', filter: MapFilter = {}, page?: number) =>
	unwrap(rpc.v1.beatmap.all[':dir'].$get({
		param: { dir: dir ?? 'desc' }, query: {
			...filter, page: page?.toString(), 
		}, 
	}));

export const getPopularMaps = (dir?: 'asc' | 'desc', filter: MapFilter = {}, page?: number) =>
	unwrap(rpc.v1.beatmap.popular[':dir'].$get({
		param: { dir: dir ?? 'desc' }, query: {
			...filter, page: page?.toString(), 
		}, 
	}));

// --- Beatmap nomination (admin) ---

/** Admin: the full nomination queue (pending + ranked + rejected). */
export const listNominations = () => unwrap(rpc.v1.beatmap.nomination.$get());

/** One row of the nomination queue, inferred from the route. */
export type Nomination = Awaited<ReturnType<typeof listNominations>>[number];

/** Admin: ingest an uploaded .osz into the queue as a pending set. */
export const uploadBeatmap = async (file: File) => {
	const form = new FormData();
	form.append('file', file);
	const res = await fetch(apiUrl('/v1/beatmap/nomination'), withAuth({
		method: 'POST', body: form, 
	}));
	return json<{ setId: number; difficulties: number }>(res);
};

export type NominationPatch = {
	rankedAt?: string | null;
	status?: BeatmapStatus;
	bundled?: boolean;
	categorized?: boolean;
	/** why a player's submission goes back to them (status 'unranked') */
	note?: string;
};

/** Admin: set the ranked date, status or tags of a set. */
export const updateNomination = (
	setId: number, 
	body: NominationPatch,
) =>
	unwrap(rpc.v1.beatmap.nomination[':setId'].$patch({
		param: { setId: String(setId) }, json: body, 
	}));

/** Admin: toggle one difficulty in/out of the set's ranked lineup. */
export const setDiffRanked = (setId: number, beatmapId: number, ranked: boolean) =>
	unwrap(rpc.v1.beatmap.nomination[':setId'].beatmap[':beatmapId'].$patch({
		param: {
			setId: String(setId), beatmapId: String(beatmapId),
		},
		json: { ranked },
	}));

/** Admin: a difficulty's hand-set tags (SV, LN). */
export const setDiffTags = (setId: number, beatmapId: number, tags: MapTag[]) =>
	unwrap(rpc.v1.beatmap.nomination[':setId'].beatmap[':beatmapId'].tags.$put({
		param: {
			setId: String(setId), beatmapId: String(beatmapId),
		},
		json: { tags },
	}));

/** Admin: drop a set (rows + files) from the queue. */
export const deleteNomination = (setId: number) =>
	unwrap(rpc.v1.beatmap.nomination[':setId'].$delete({ param: { setId: String(setId) } }));

/** Public: a set and its live difficulties, easiest first. */
export const getMapset = (id: number | string) =>
	unwrap(rpc.v1.beatmap.set[':id'].$get({ param: { id: String(id) } }));

export type Mapset = Awaited<ReturnType<typeof getMapset>>;
export type MapDiff = Mapset['diffs'][number];

/** Public: a difficulty's leaderboard, worldwide, in one country, or among the viewer's friends. */
export const getMapBoard = (beatmapId: number, filter: { country?: string; friends?: boolean }) =>
	unwrap(rpc.v1.scores.beatmap[':beatmap'].board.$get({
		param: { beatmap: String(beatmapId) },
		query: {
			country: filter.country, friends: filter.friends ? '1' : undefined,
		},
	}));

export type BoardRow = Awaited<ReturnType<typeof getMapBoard>>[number];

/** A queued set's audio preview, public or not (admin). */
export const nominationPreviewUrl = (setId: number, file: string) =>
	apiUrl(`/v1/beatmap/nomination/${setId}/preview/${encodeURIComponent(file)}`);

/** A queued set's .osz, public or not (admin). */
export const nominationOszUrl = (setId: number) =>
	apiUrl(`/v1/beatmap/nomination/${setId}/osz`);

/** A set's audio preview. */
export const previewUrl = (setId: number, file: string) =>
	apiUrl(`/v1/beatmap/preview/${setId}/${encodeURIComponent(file)}`);

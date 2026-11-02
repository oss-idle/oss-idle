import {
	ph,
	t,
} from '@lingui/core/macro';

import Synced from '@oss-idle/shared/helpers/synced';

import { music } from '../../audio/MusicPlayer';
import {
	isWebOpen,
	message,
	openPage,
	webUrl,
} from '../../globals';
import Auth from '../../online/auth';
import BeatmapAPI, { type Metadata } from '../../osu/beatmap/beatmap_api';
import { findCard } from '../../osu/beatmap/findCard';
import LightBeatmapSet from '../../osu/beatmap/LightBeatmapSet';
import SceneManager, { SCENE } from '../../scenes/SceneManager';

export type DirectDisplay = 'ranked' | 'loved' | 'unranked' | 'all';

export const directDisplay = new Synced<DirectDisplay>('ranked');
export const showDownloaded = new Synced(false);
export const directSearch = new Synced('');
/** The set the panel shows. */
export const directSelected = new Synced<number | undefined>(undefined);
/** The set a map link opened: its panel alone, over whatever is on screen. */
export const directLink = new Synced<number | undefined>(undefined);
/** Downloads in flight, by set id: progress 0..1. */
export const directDownloads = new Synced<Record<number, number>>({});

const setProgress = (setId: number, progress: number | undefined) => {
	const next = { ...directDownloads.get() };
	if (progress === undefined) delete next[setId];
	else next[setId] = progress;
	void directDownloads.set(next);
};

export const downloadSet = async (meta: Metadata): Promise<void> => {
	if (meta.id in directDownloads.get()) return;
	setProgress(meta.id, 0);
	try {
		await BeatmapAPI.downloadOsz(meta, progress => setProgress(meta.id, progress));
		void message.set(t`Finished downloading ${ph({ title: meta.title })}`);
	} catch (e) {
		console.error('[direct] download failed', e);
		void message.set(t`Could not download ${ph({ title: meta.title })}`);
	} finally {
		setProgress(meta.id, undefined);
	}
};

export const downloadLabel = (downloaded: boolean, progress: number | undefined) => {
	if (downloaded) return t`Downloaded`;
	if (progress === undefined) return t`Download`;
	const percent = Math.round(progress * 100);
	return t`Downloading ${percent}%`;
};

// the menu's music follows what is picked; elsewhere a play or song select owns it
export const preview = (set: Metadata) => {
	if (SceneManager.current.get() !== SCENE.MENU) return;
	const beatmap = LightBeatmapSet.fromMetadata(set).beatmaps[0];
	if (beatmap) void music.beatmap.set(beatmap).then(() => music.play(0));
};

export const goToMap = async (set: Metadata) => {
	const beatmap = (await findCard(set.versions[0].id, set.id))?.beatmap;
	if (!beatmap?.metadata.runtime) return;
	await openPage.set(undefined);
	await directLink.set(undefined);
	await music.beatmap.set(beatmap);
	if (SceneManager.current.get() !== SCENE.SELECT) SceneManager.set(SCENE.SELECT);
};

/** A set's preview background as a CSS background. */
export const coverStyle = (set: Metadata) => {
	const url = BeatmapAPI.assetUrl(set.background);
	return url ? { backgroundImage: `url("${url}")` } : undefined;
};

export const openMapPage = (setId: number) => {
	void webUrl.set(`maps/${setId}`);
	void isWebOpen.set(true);
};

/** oss!direct for supporters; anyone else is told so and sent to the store. */
export const openDirect = () => {
	if (!Auth.user.get()?.supporter) {
		void message.set(t`oss!direct is an oss!supporter feature`);
		void webUrl.set('store');
		void isWebOpen.set(true);
		return;
	}
	void openPage.set({ page: 'direct' });
};

/** Ctrl+B: oss!direct for supporters; anyone else is only told so. */
export const toggleDirect = () => {
	if (openPage.get()?.page === 'direct') void openPage.set(undefined);
	else if (Auth.user.get()?.supporter) void openPage.set({ page: 'direct' });
	else void message.set(t`oss!direct is an oss!supporter feature`);
};

import { i18n } from '@lingui/core';
import {
	ph,
	t,
} from '@lingui/core/macro';
import {
	strToU8,
	unzip,
	type Unzipped,
} from 'fflate';
import { BeatmapDecoder } from 'osu-parsers';
import * as ppjs from 'rosu-pp-js-web';

import { unwrapArchive } from '@oss-idle/shared/osuSkin/files';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import { emptyIn } from '@oss-idle/shared/rulesets/mania/editor/chart';

import { music } from '../../audio/MusicPlayer';
import { SETTINGS } from '../../db/settings';
import { message } from '../../globals';
import { pickFile } from '../../pickFile';
import { ENABLED_RULESETS } from '../../rulesets/enabled';
import { selectedRuleset } from '../../rulesets/registry';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import rosuReady from '../rosu';
import BeatmapStore, {
	type SetRecord,
	type StoreMetadata,
} from './beatmap_store';
import LightBeatmapSet from './LightBeatmapSet';
import { isChart } from './setFiles';

/** FNV-1a, 31 bits: stable across sessions, unlike any random id. */
const hash = (text: string): number => {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return h & 0x7fffffff;
};

/** Negative, so it never meets a server id; derived from the map, so importing
 *  it again replaces it and keeps its local scores. */
export const localId = (key: string): number => -(hash(key) || 1);

/** The local id a set's charts give it: by its BeatmapSetID when it has one (another map of
 *  the same song and mapper is another set), else by artist, title and mapper. */
type SetNames = { setId?: number, artist: string, title: string, creator: string };

export const localSetId = (map: SetNames) =>
	localId(map.setId && map.setId > 0
		? `set\n${map.setId}`
		: `${map.artist}\n${map.title}\n${map.creator}`);

/** Store an .osz from the player's own files as a local set. */
export const importOsz = async (data: Uint8Array): Promise<SetRecord> => {
	const files = unwrapArchive(await new Promise<Unzipped>((resolve, reject) => {
		unzip(data, (err, out) => (err ? reject(err) : resolve(out)));
	}));
	return importFiles({
		...files, ...emptyChartsInRuleset(files),
	});
};

/** A local set's metadata out of its files: the set `id` when given, else the one its charts
 *  give it. */
export const localMetadata = async (files: Unzipped, setId?: number): Promise<StoreMetadata> => {
	const decoder = new TextDecoder();
	const charts = Object.keys(files)
		.filter(isChart)
		.map(file => {
			const text = decoder.decode(files[file]);
			return {
				file, text, beatmap: new BeatmapDecoder().decodeFromString(text), 
			};
		});
	if (!charts.length) throw new Error('no .osu in the archive');

	const { artist, title, creator, beatmapSetId } = charts[0].beatmap.metadata;
	const id = setId ?? localSetId({
		setId: beatmapSetId, artist, title, creator,
	});
	await rosuReady();
	const versions = charts.map(({ file, text }) => ({
		id: localId(`${id}\n${file}`),
		file,
		difficulty: Math.round(new ppjs.Difficulty({ lazer: false })
			.calculate(new ppjs.Beatmap(text)).stars * 100) / 100,
	}));
	return {
		id, artist, title, creator, versions,
	};
};

/** The set's charts with no notes made charts of the picked ruleset, for the editor to open:
 *  only those, rewritten. */
export const emptyChartsInRuleset = (files: Unzipped): Unzipped => {
	const decoder = new TextDecoder();
	return Object.fromEntries(Object.keys(files).filter(isChart).flatMap(file => {
		const text = decoder.decode(files[file]);
		const moved = emptyIn(text, selectedRuleset.get());
		return moved === text ? [] : [[file, strToU8(moved)]];
	}));
};

/** Store an unpacked set as a local set, replacing the one it was imported as before,
 *  or the local set `id` when given. */
export const importFiles = async (files: Unzipped, setId?: number): Promise<SetRecord> =>
	BeatmapStore.storeOsz(await localMetadata(files, setId), files, true);

/** What this build plays, as a player reads it: "4K", or "4K or 7K". */
const playedLabels = () =>
	new Intl.ListFormat(i18n.locale, { type: 'disjunction' })
		.format(ENABLED_RULESETS.map(rulesetLabel));

const importFile = async (file: File): Promise<SetRecord | undefined> => {
	message.set(t`Importing ${ph({ name: file.name })}...`);
	try {
		const set = await importOsz(new Uint8Array(await file.arrayBuffer()));
		const { title } = set.metadata;
		const rulesets = playedLabels();
		message.set(LightBeatmapSet.fromMetadata(set.metadata).getPlayableBeatmaps().length
			? t`Imported ${ph({ title })}`
			: t`Imported ${ph({ title })}, but it has no ${ph({ rulesets })} difficulty to play`);
		return set;
	} catch (e) {
		console.error('[oszImport] import failed', e);
		message.set(t`Could not import ${ph({ name: file.name })}`);
	}
};

/** A set's easiest difficulty this build plays. */
export const easiestPlayable = (set: SetRecord) =>
	LightBeatmapSet.fromMetadata(set.metadata).getPlayableBeatmaps()
		.sort((a, b) => a.metadata.difficulty - b.metadata.difficulty)[0];

/** Play a freshly imported set: song select moves to it, the main menu plays it. */
const playImported = async (set: SetRecord) => {
	const scene = SceneManager.current.get();
	const beatmap = easiestPlayable(set);
	if (!beatmap || (scene !== SCENE.SELECT && scene !== SCENE.MENU)) return;
	await music.beatmap.set(beatmap);
	if (scene === SCENE.SELECT) await SETTINGS.search.set('');
	else await music.play(0);
};

/** Ask the player for an .osz and import it; undefined when they cancel or it fails. */
export const pickOsz = async (): Promise<SetRecord | undefined> => {
	const file = await pickFile('.osz');
	return file && importFile(file);
};

const isOsz = (file: File) => file.name.toLowerCase().endsWith('.osz');

window.addEventListener('dragover', e => {
	if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', e => {
	const files = [...e.dataTransfer?.files ?? []];
	if (!files.length) return;
	e.preventDefault();
	const osz = files.filter(isOsz);
	void (async () => {
		const sets = [];
		for (const file of osz) sets.push(await importFile(file));
		if (sets.length === 1 && sets[0]) await playImported(sets[0]);
	})();
});

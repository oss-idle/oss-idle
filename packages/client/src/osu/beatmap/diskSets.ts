import type { Unzipped } from 'fflate';

import type { LibraryEntry } from '@oss-idle/shared/desktop';

import {
	entriesOf,
	entryById,
	freeName,
	ownsId,
	readEntryFile,
	removeEntry,
	writeEntry,
} from '../../library';
import type { RuntimeMetadata } from './beatmap_store';
import {
	isChart,
	mime,
	normalizeName,
} from './setFiles';

/**
 * Sets on disk (desktop): a folder each in the maps folder, its files as the .osz holds
 * them and the game's metadata in its info.
 */

const metaOf = (entry: LibraryEntry) => entry.info as RuntimeMetadata;

const isSet = (entry: LibraryEntry) => Array.isArray(metaOf(entry)?.versions);

/** A file's name as Windows takes it: some .osz entry names hold `?` and the like. */
const diskName = (name: string) => name.replace(/[<>:"|?*\u0000-\u001f]/g, '_');

const setEntry = async (id: number) => {
	const entry = await entryById('maps', id);
	return entry && isSet(entry) ? entry : undefined;
};

/** The file's path in the folder, for a name the way charts refer to it. */
const pathIn = (entry: LibraryEntry, name: string) => {
	const key = normalizeName(diskName(name));
	return entry.files.find(file => normalizeName(file.path) === key)?.path;
};

const read = async (entry: LibraryEntry, name: string) => {
	const path = pathIn(entry, name);
	return path ? readEntryFile('maps', entry.name, path, mime(path)) : undefined;
};

export const diskMeta = async (id: number) => {
	const entry = await setEntry(id);
	return entry && metaOf(entry);
};

export const diskAllMeta = async (): Promise<RuntimeMetadata[]> => {
	const sets: RuntimeMetadata[] = [];
	for (const entry of await entriesOf('maps')) {
		if (isSet(entry) && await ownsId('maps', entry)) sets.push(metaOf(entry));
	}
	return sets;
};

/** Store a set: `files` as they go in its folder, `meta` as its info. */
export const putDiskSet = async (
	meta: RuntimeMetadata, files: Unzipped, replace: boolean,
): Promise<void> => {
	const name = (await entryById('maps', meta.id))?.name
		?? await freeName('maps', `${meta.id} ${meta.artist} - ${meta.title}`);
	const onDisk = Object.entries(files).map(([file, data]) => [diskName(file), data]);
	await writeEntry('maps', name, Object.fromEntries(onDisk), meta, replace);
};

/** The set's new metadata, and its files `dropped` gone. */
export const updateDiskSet = async (meta: RuntimeMetadata, dropped: string[]): Promise<void> => {
	const entry = await setEntry(meta.id);
	if (!entry) return;
	const paths = dropped.map(name => pathIn(entry, name)).filter(path => path !== undefined);
	const gone = Object.fromEntries(paths.map(path => [path, undefined]));
	await writeEntry('maps', entry.name, gone, meta);
};

export const diskFile = async (id: number, name: string): Promise<Blob | undefined> => {
	const entry = await setEntry(id);
	return entry && read(entry, name);
};

export const diskCharts = async (id: number): Promise<Record<number, string> | undefined> => {
	const entry = await setEntry(id);
	if (!entry) return undefined;
	const osu: Record<number, string> = {};
	for (const version of metaOf(entry).versions) {
		const blob = version.file ? await read(entry, version.file) : undefined;
		if (blob) osu[version.id] = await blob.text();
	}
	return osu;
};

export const diskChart = async (id: number, beatmapId: number): Promise<string | undefined> => {
	const file = (await diskMeta(id))?.versions.find(version => version.id === beatmapId)?.file;
	return file && (await diskFile(id, file))?.text();
};

/** Every file of the set but its charts, by its path in the folder. */
export const diskFiles = async (id: number): Promise<Unzipped> => {
	const entry = await setEntry(id);
	const files: Unzipped = {};
	for (const { path } of entry?.files ?? []) {
		if (isChart(path)) continue;
		const blob = await readEntryFile('maps', entry!.name, path);
		if (blob) files[path] = new Uint8Array(await blob.arrayBuffer());
	}
	return files;
};

export const diskOsbName = async (id: number) =>
	(await setEntry(id))?.files.find(file => file.path.toLowerCase().endsWith('.osb'))?.path;

export const removeDiskSet = async (id: number): Promise<void> => {
	const entry = await setEntry(id);
	if (entry) await removeEntry('maps', entry.name);
};

export const removeAllDiskSets = async (): Promise<void> => {
	for (const entry of await entriesOf('maps')) await removeEntry('maps', entry.name);
};

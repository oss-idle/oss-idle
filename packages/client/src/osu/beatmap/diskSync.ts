import type { Unzipped } from 'fflate';

import type { LibraryEntry } from '@oss-idle/shared/desktop';

import {
	entriesOf,
	entryById,
	onLibraryChanged,
	ownsId,
	readEntryFile,
	writeEntry,
} from '../../library';
import {
	beatmapsVersion,
	deriveSet,
	onDisk,
	type RuntimeMetadata,
	type StoreMetadata,
} from './beatmap_store';
import {
	emptyChartsInRuleset,
	localId,
	localMetadata,
} from './oszImport';
import { isChart } from './setFiles';

/**
 * What the player does in the maps folder (desktop): a set's charts changed there are
 * read again, and a folder the game does not know yet becomes a local set.
 */

const chartsIn = async (entry: LibraryEntry): Promise<Unzipped> => {
	const charts: Unzipped = {};
	for (const { path } of entry.files.filter(file => isChart(file.path))) {
		const blob = await readEntryFile('maps', entry.name, path);
		if (blob) charts[path] = new Uint8Array(await blob.arrayBuffer());
	}
	return charts;
};

/** A catalog set keeps its ids and star ratings: only what its charts say is read again. */
const catalogMetadata = (known: RuntimeMetadata): StoreMetadata => ({
	...known,
	versions: known.versions.map(({ id, file, difficulty }) => ({
		id, file, difficulty,
	})),
});

/** The folder's metadata, out of its charts as they are now. */
const refresh = async (entry: LibraryEntry): Promise<void> => {
	const found = await chartsIn(entry);
	if (!Object.keys(found).length) return;
	const known = await ownsId('maps', entry) ? entry.info as RuntimeMetadata : undefined;
	// a folder new to the game is an import; the editor's own saves stay as they are
	const rewritten = known ? {} : emptyChartsInRuleset(found);
	const charts = {
		...found, ...rewritten,
	};
	let metadata = known && known.id > 0
		? catalogMetadata(known)
		: await localMetadata(charts, known?.id);
	// a copy of a set's folder is a set of its own
	const owner = !known && await entryById('maps', metadata.id);
	if (owner && owner.name !== entry.name) {
		metadata = await localMetadata(charts, localId(`folder\n${entry.name}`));
	}
	await writeEntry('maps', entry.name, rewritten, deriveSet(metadata, charts).runtimeMetadata);
};

let queue: Promise<unknown> = Promise.resolve();

const later = (job: () => Promise<void>) => {
	queue = queue.then(job).catch(e => console.error('[maps folder]', e));
};

const bump = () => void beatmapsVersion.set(beatmapsVersion.get() + 1);

/** Take in the folders the game does not know, then follow what the player changes. */
export const watchMapFolders = async (): Promise<void> => {
	if (!await onDisk()) return;
	onLibraryChanged('maps', change => later(async () => {
		const { entry } = change;
		if (entry && (!entry.info || change.changed.some(isChart))) await refresh(entry);
		bump();
	}));
	later(async () => {
		let found = false;
		for (const entry of await entriesOf('maps')) {
			if (await ownsId('maps', entry)) continue;
			await refresh(entry);
			found = true;
		}
		if (found) bump();
	});
};

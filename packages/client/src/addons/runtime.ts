import type { LibraryEntry } from '@oss-idle/shared/desktop';
import { VERSION } from '@oss-idle/shared/version';

import {
	Addon,
	addonsVersion,
} from '../db/schema/addon';
import { message } from '../globals';
import {
	entriesOf,
	entryById,
	idOf,
	library,
	onLibraryChanged,
	ownsId,
	writeEntry,
} from '../library';
import type { Addon as AddonDTO } from '../online/addons';
import {
	addonsMoved,
	markAddonsMoved,
	readAddonFile,
	removeAddonFile,
	writeAddonFile,
} from './addonFiles';
import {
	type AddonHost,
	hostFor,
} from './host';

/**
 * Add-on runtime. Add-ons are unsandboxed userscripts: we run them by turning
 * their source into an ES module (via a Blob URL) and importing it in the page
 * realm, so they have full window/DOM access. The contract is the two exports
 * `mount` / `unmount`; `mount` gets the add-on's own metadata and the game's host
 * (its React, the editor: see host.ts). An optional `canUpdate` export answers
 * false while the add-on would rather not be restarted by an auto-update.
 *
 * A live add-on's `unmount` is held here so enabling/disabling, updating, or
 * uninstalling can tear it down cleanly without a page reload.
 */

type AddonMeta = Pick<Addon, 'id' | 'name' | 'version' | 'gameVersion' | 'authorId' | 'authorName'>;

type AddonModule = {
	mount?: (addon: AddonMeta, host: AddonHost) => void,
	unmount?: () => void | Promise<void>,
	canUpdate?: () => boolean | Promise<boolean>,
};

type Live = {
	stop: () => Promise<void>,
	canUpdate: AddonModule['canUpdate'],
};

/** Loaded add-ons, by add-on id. */
const live = new Map<number, Live>();

/**
 * Import an add-on's source as an ES module (full page access, real exports)
 */
const load = async (source: string): Promise<AddonModule> => {
	const url = URL.createObjectURL(
		new Blob([source], 
			{ type: 'text/javascript' },
		));
	try {
		return await import(/* @vite-ignore */ url) as AddonModule;
	} finally {
		URL.revokeObjectURL(url);
	}
};

/** Import an add-on's source, call `mount`, and remember its `unmount`. */
const start = async ({
	id, name, version, gameVersion, authorId, authorName, source,
}: Addon): Promise<void> => {
	const { host, release } = hostFor();
	try {
		const mod = await load(source);
		mod.mount?.({
			id, name, version, gameVersion, authorId, authorName,
		}, host);
		live.set(id, {
			stop: async () => {
				try {
					await mod.unmount?.();
				} finally {
					release();
				}
			},
			canUpdate: mod.canUpdate,
		});
	} catch (e) {
		// what it hooked into the editor before failing goes with it
		release();
		console.error(`Add-on "${name}" failed to load`, e);
		message.set(`Add-on "${name}" failed to load`);
	}
};

/** Add-ons still loading, by id: a second mount waits on it rather than loading a twin. */
const loading = new Map<number, Promise<void>>();

/** Run an add-on's source once, even when asked again while it loads. */
const mount = (addon: Addon): Promise<void> => {
	if (live.has(addon.id)) return Promise.resolve();
	let pending = loading.get(addon.id);
	if (!pending) {
		pending = start(addon).finally(() => loading.delete(addon.id));
		loading.set(addon.id, pending);
	}
	return pending;
};

/** Tear down a live add-on (its `unmount`), if running, and wait for it to finish. */
const unmount = async (id: number, name: string): Promise<void> => {
	await loading.get(id);
	const running = live.get(id);
	if (!running) return;
	live.delete(id);
	try {
		await running.stop();
	} catch (e) {
		console.error(`Add-on "${name}" failed to unmount`, e);
	}
	// older SDK builds return nothing and finish their teardown on microtasks
	await new Promise(resolve => setTimeout(resolve));
};

/** Enable an installed add-on: persist the flag and mount it. */
export const enableAddon = async (addon: Addon): Promise<void> => {
	await addon.setEnabled(true);
	await mount(addon);
};

/** Save a catalog add-on locally and enable it. */
export const installAddon = async (dto: AddonDTO): Promise<void> => {
	const installed = await new Addon({
		id: dto.id,
		name: dto.name,
		description: dto.description,
		version: dto.version,
		gameVersion: dto.gameVersion,
		source: dto.source,
		icon: dto.icon,
		authorId: dto.authorId,
		authorName: dto.authorName,
		tags: dto.tags.join(','),
		types: dto.types.join(','),
		status: dto.status,
		enabled: false,
		installedAt: Date.now(),
	}).add();
	await writeAddonFile(installed);
	await enableAddon(installed);
};

/** Disable an installed add-on: persist the flag and unmount it. */
export const disableAddon = async (addon: Addon): Promise<void> => {
	await addon.setEnabled(false);
	await unmount(addon.id, addon.name);
};

/** Uninstall an add-on: unmount (if live) and drop its local row. */
export const uninstallAddon = async (addon: Addon): Promise<void> => {
	await unmount(addon.id, addon.name);
	// the folder first: one left without its row would come back as a new add-on
	await removeAddonFile(addon.id);
	await addon.uninstall();
};

/** Swap a running add-on's source after an update: unmount old, mount new. */
export const remountAddon = async (addon: Addon): Promise<void> => {
	await unmount(addon.id, addon.name);
	if (addon.enabled) await mount(addon);
};

/** Whether a running add-on lets an auto-update restart it now (one that throws is not trusted to hold it). */
export const allowsUpdate = async (id: number): Promise<boolean> => {
	try {
		return await live.get(id)?.canUpdate?.() ?? true;
	} catch (e) {
		console.error(`Add-on ${id}: canUpdate failed`, e);
		return true;
	}
};

/** Take a published version in: save it, rewrite its file, and restart it if it runs. */
export const applyAddonUpdate = async (local: Addon, remote: AddonDTO): Promise<void> => {
	await local.update({
		source: remote.source,
		version: remote.version,
		gameVersion: remote.gameVersion,
		name: remote.name,
		description: remote.description,
		tags: remote.tags.join(','),
		types: remote.types.join(','),
		icon: remote.icon,
		status: remote.status,
	});
	addonsVersion.set(addonsVersion.get() + 1);
	await writeAddonFile(local);
	await remountAddon(local);
};

/** A folder the game did not make, as a local add-on. Its code stays off until the player
 *  enables it. An id written in the folder may be another server's: it gets its own. */
const adopt = async (entry: LibraryEntry, source: string): Promise<void> => {
	const id = Math.min(0, ...(await Addon.getAll()).map(a => a.id)) - 1;
	await writeEntry('addons', entry.name, {}, { id });
	await new Addon({
		id,
		name: entry.name,
		description: '',
		version: '1.0.0',
		gameVersion: VERSION,
		source,
		authorId: 0,
		authorName: '',
		tags: '',
		types: '',
		status: 'unpublished',
		enabled: false,
		installedAt: Date.now(),
	}).add();
	addonsVersion.set(addonsVersion.get() + 1);
};

const adoptFolders = async (): Promise<void> => {
	const installed = new Set((await Addon.getAll()).map(a => a.id));
	for (const entry of await entriesOf('addons')) {
		const id = idOf(entry);
		if (id !== undefined && installed.has(id) && await ownsId('addons', entry)) continue;
		const source = await readAddonFile(entry);
		if (source !== undefined) await adopt(entry, source);
	}
};

/** On desktop the code lives in each add-on's folder: what changed there is taken in (and
 *  runs), an add-on whose folder went is uninstalled, and a new folder is a new add-on. */
const syncFolders = async (): Promise<void> => {
	const moved = addonsMoved();
	for (const addon of await Addon.getAll()) {
		const entry = await entryById('addons', addon.id);
		if (!entry) {
			if (moved) await uninstallAddon(addon);
			else await writeAddonFile(addon);
			continue;
		}
		const source = await readAddonFile(entry);
		if (source === undefined || source === addon.source) continue;
		await addon.update({ source });
		addonsVersion.set(addonsVersion.get() + 1);
		await remountAddon(addon);
	}
	markAddonsMoved();
	await adoptFolders();
};

let queue: Promise<unknown> = Promise.resolve();
const later = (job: () => Promise<void>) => {
	queue = queue.then(job).catch(e => console.error('[add-ons folder]', e));
};

let timer: ReturnType<typeof setTimeout> | undefined;

/** On boot, mount every enabled installed add-on. */
export const bootAddons = async (): Promise<void> => {
	if (library()) {
		later(syncFolders);
		await queue;
		onLibraryChanged('addons', () => {
			clearTimeout(timer);
			// a folder renamed goes and comes back: look once both are in
			timer = setTimeout(() => later(syncFolders), 300);
		});
	}
	const installed = await Addon.getAll();
	await Promise.all(
		installed
			.filter(a => a.enabled)
			.map(mount),
	);
};

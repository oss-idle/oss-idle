import {
	expect,
	it,
	vi,
} from 'vitest';

import { bootAddons } from '@oss-idle/client/addons/runtime';

type Row = { id: number, name: string, enabled: boolean, source: string };

const { rows, folders } = vi.hoisted(() => ({
	rows: [] as Row[],
	folders: new Map<string, { name: string, info?: { id: number }, code?: string }>(),
}));

vi.mock('@oss-idle/client/globals', () => ({ message: { set: () => {} } }));
vi.mock('@oss-idle/client/db/schema/addon', () => ({
	addonsVersion: {
		get: () => 0, set: () => {},
	},
	Addon: class {
		static getAll = async () => rows;
		constructor(readonly row: Row) {}
		add = async () => { rows.push(this.row); };
	},
}));
vi.mock('@oss-idle/client/addons/addonFiles', () => ({
	addonsMoved: () => true,
	markAddonsMoved: () => {},
	readAddonFile: async (entry: { code?: string }) => entry.code,
	removeAddonFile: async () => {},
	writeAddonFile: async () => {},
}));
vi.mock('@oss-idle/client/library', () => {
	const idOf = (entry: { info?: { id: number } }) => entry.info?.id;
	const entryById = async (_kind: string, id: number) =>
		[...folders.values()].find(f => idOf(f) === id);
	return {
		library: () => ({}),
		onLibraryChanged: () => {},
		entriesOf: async () => [...folders.values()],
		entryById,
		idOf,
		ownsId: async (kind: string, entry: { name: string, info?: { id: number } }) =>
			(await entryById(kind, idOf(entry) ?? NaN))?.name === entry.name,
		writeEntry: async (_kind: string, name: string, _files: object, info: { id: number }) => {
			folders.get(name)!.info = info;
		},
	};
});

it('takes in folders the game does not know, off, and leaves the rest', async () => {
	const known = {
		id: 7, name: 'known', enabled: false, source: 'known',
	};
	rows.push(known);
	folders.set('known', {
		name: 'known', info: { id: 7 }, code: 'known',
	});
	// copied from another install: its id means nothing here
	folders.set('copied', {
		name: 'copied', info: { id: 5 }, code: 'copied',
	});
	folders.set('copy of known', {
		name: 'copy of known', info: { id: 7 }, code: 'twin',
	});
	folders.set('no id', {
		name: 'no id', code: 'bare',
	});
	folders.set('no code', { name: 'no code' });

	await bootAddons();

	expect(rows.map(({
		id, name, enabled, source,
	}) => ({
		id, name, enabled, source,
	}))).toEqual([
		known,
		{
			id: -1, name: 'copied', enabled: false, source: 'copied',
		},
		{
			id: -2, name: 'copy of known', enabled: false, source: 'twin',
		},
		{
			id: -3, name: 'no id', enabled: false, source: 'bare',
		},
	]);
	expect(folders.get('copied')?.info).toEqual({ id: -1 });
	expect(folders.get('no code')?.info).toBeUndefined();
});
